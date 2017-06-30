'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * Copyright 2015-present Desmond Yao
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Created by desmond on 4/16/17.
 * 
 */

var babylon = require('babylon');
var traverse = require('babel-traverse').default;
var path = require('path');
var minimatch = require('minimatch');
var Util = require('./utils');
var fs = require('fs');
var assetPathUtil = require('./assetPathUtils');

var MODULE_SPLITER = '\n';

var Parser = function () {
  function Parser(codeBlob, config) {
    _classCallCheck(this, Parser);

    this._codeBlob = codeBlob;
    this._config = config;
    this._useCustomSplit = typeof config.customEntries !== 'undefined';
    this._modules = {};

    this._polyfills = []; // polyfill codes range, always append on start.
    this._moduleCalls = []; // module call codes range, always append on end.

    this._base = new Set(); // store module id of base modules
    this._customEntries = [];
    this._bundles = []; // store split codes
  }

  _createClass(Parser, [{
    key: 'splitBundle',
    value: function splitBundle() {
      var outputDir = this._config.outputDir;
      Util.ensureFolder(outputDir);
      var bundleAST = babylon.parse(this._codeBlob, {
        sourceType: 'script',
        plugins: ['jsx', 'flow']
      });
      this._parseAST(bundleAST);
      this._doSplit();

      this._bundles.forEach(function (subBundle) {
        console.log('====== Split ' + subBundle.name + ' ======');
        var code = subBundle.codes.join(MODULE_SPLITER);
        var subBundlePath = path.resolve(outputDir, subBundle.name);
        Util.ensureFolder(subBundlePath);

        var codePath = path.resolve(subBundlePath, 'index.bundle');
        fs.writeFileSync(codePath, code);
        console.log('[Code] Write code to ' + codePath);
        if (subBundle.assetRenames) {
          subBundle.assetRenames.forEach(function (item) {
            var assetNewDir = path.dirname(item.newPath);
            Util.ensureFolder(assetNewDir);
            console.log('[Resource] Move resource ' + item.originPath + ' to ' + item.newPath);
            fs.createReadStream(item.originPath).pipe(fs.createWriteStream(item.newPath));
          });
        }
        console.log('====== Split ' + subBundle.name + ' done! ======');
      });
    }
  }, {
    key: '_parseAST',
    value: function _parseAST(bundleAST) {
      var _this = this;

      var program = bundleAST.program;
      var body = program.body;
      var customBase = [];
      var customEntry = [];
      var reactEntryModule = undefined;
      var moduleCount = 0;
      body.forEach(function (node) {
        if (Util.isEmptyStmt(node)) {
          return;
        }

        var start = node.start,
            end = node.end;


        if (Util.isPolyfillCall(node, _this._config.dev)) {
          // push polyfill codes to base.
          _this._polyfills.push({ start: start, end: end });
        } else if (Util.isModuleCall(node)) {
          _this._moduleCalls.push({ start: start, end: end });
        } else if (Util.isModuleDeclaration(node)) {
          moduleCount++;
          var args = node.expression.arguments;
          var _moduleId = parseInt(args[1].value);
          var moduleName = args[3].value;
          var _module = {
            id: _moduleId,
            name: moduleName,
            dependencies: _this._getModuleDependency(args[0].body),
            code: { start: start, end: end },
            idCodeRange: {
              start: args[1].start - node.start,
              end: args[1].end - node.start
            }
          };

          if (Util.isAssetModule(moduleName)) {
            _module.isAsset = true;
            _module.assetConfig = Object.assign({}, Util.getAssetConfig(node), { moduleId: _moduleId });
            console.log('Get asset module ' + moduleName, _module.assetConfig);
          }

          if (!reactEntryModule && Util.isReactNativeEntry(moduleName)) {
            // get react native entry, then init base set.
            reactEntryModule = _moduleId;
          }

          if (_this._isBaseEntryModule(_module)) {
            console.log('Get base entry module: ' + moduleName);
            _this._baseEntryIndexModule = _moduleId;
          } else if (_this._isCustomBaseModule(_module)) {
            console.log('Get custom base ' + moduleName);
            customBase.push(_moduleId);
          } else if (_this._useCustomSplit) {
            var entry = _this._isCustomEntryModule(_module);
            if (!!entry) {
              console.log('Get custom entry ' + moduleName);
              customEntry.push({
                id: _moduleId,
                name: entry.name
              });
            }
          }

          _this._modules[_moduleId] = _module;
          console.log('Module ' + moduleName + '(' + _moduleId + ') dependency:' + JSON.stringify(_module.dependencies));
        } else {
          console.log(require('util').inspect(node, false, null));
          console.log('Cannot parse node!', _this._codeBlob.substring(node.start, node.end));
        }
      });

      // generate react-native based module firstly.
      if (reactEntryModule) {
        this._genBaseModules(reactEntryModule);
      } else {
        console.warn('Cannot find react-native entry module! You should require(\'react-native\') at some entry.');
      }

      // append custom base modules.
      customBase.forEach(function (base) {
        _this._genBaseModules(base);
      });

      if (typeof this._baseEntryIndexModule !== 'undefined') {
        (function () {
          var module = _this._modules[_this._baseEntryIndexModule];
          var dependency = module.dependencies;

          var _loop = function _loop(i) {
            if (!!customEntry.find(function (item) {
              return item.id === dependency[i];
            })) {
              dependency.splice(i, 1);
            }
          };

          for (var i = dependency.length - 1; i >= 0; i--) {
            _loop(i);
          }
          _this._genBaseModules(_this._baseEntryIndexModule);
        })();
      }

      if (!!customEntry) {
        // after gen base module, generate custom entry sets.
        customEntry.forEach(function (entry) {
          _this._genCustomEntryModules(entry.name, entry.id);
        });
      }

      // console.log('Get polyfills', this._polyfills);
      console.log('Total modules :' + moduleCount);
      console.log('Base modules size: ' + this._base.size);
    }
  }, {
    key: '_genBaseModules',
    value: function _genBaseModules(moduleId) {
      var _this2 = this;

      this._base.add(moduleId);
      var module = this._modules[moduleId];
      var queue = module.dependencies;

      if (!queue) {
        return;
      }
      var added = 0;
      while (queue.length > 0) {
        var tmp = queue.shift();

        if (this._base.has(tmp)) {
          continue;
        }

        if (this._modules[tmp].dependencies && this._modules[tmp].dependencies.length > 0) {
          this._modules[tmp].dependencies.forEach(function (dep) {
            if (!_this2._base.has(dep)) {
              queue.push(dep);
            }
          });
        }
        added++;
        this._base.add(tmp);
      }
      console.log('Module ' + module.name + ' added to base (' + added + ' more dependency added too)');
    }
  }, {
    key: '_genCustomEntryModules',
    value: function _genCustomEntryModules(name, moduleId) {
      var _this3 = this;

      var set = new Set();
      set.add(moduleId);

      var module = this._modules[moduleId];
      var queue = module.dependencies;

      if (!queue) {
        return;
      }
      var added = 0;
      while (queue.length > 0) {
        var tmp = queue.shift();

        if (set.has(tmp) || this._base.has(tmp)) {
          continue;
        }

        var dependency = this._modules[tmp].dependencies;
        if (dependency && dependency.length > 0) {
          dependency.forEach(function (dep) {
            if (!_this3._base.has(dep) && !set.has(dep)) {
              queue.push(dep);
            }
          });
        }
        added++;
        set.add(tmp);
      }
      this._customEntries.push({
        moduleId: moduleId,
        name: name,
        moduleSet: set
      });
      console.log('Module ' + module.name + ' added to bundle ' + name + '. (' + added + ' more dependency added too)');
    }
  }, {
    key: '_getModuleDependency',
    value: function _getModuleDependency(bodyNode) {
      if (bodyNode.type === 'BlockStatement') {
        var _start = bodyNode.start,
            _end = bodyNode.end;

        return Util.getModuleDependency(this._codeBlob, _start, _end);
      }
      return [];
    }
  }, {
    key: '_isBaseEntryModule',
    value: function _isBaseEntryModule(module) {
      var baseIndex = this._config.baseEntry.index;
      var indexGlob = path.join(this._config.packageName, baseIndex + '.tmp');
      // base index entry.
      return minimatch(module.name, indexGlob);
    }
  }, {
    key: '_isCustomEntryModule',
    value: function _isCustomEntryModule(module) {
      var _this4 = this;

      return this._config.customEntries.find(function (entry) {
        var pathGlob = path.join(_this4._config.packageName, entry.index);
        return minimatch(module.name, pathGlob);
      });
    }
  }, {
    key: '_isCustomBaseModule',
    value: function _isCustomBaseModule(module) {
      var _this5 = this;

      if (this._config.baseEntry.includes && this._config.baseEntry.includes.length > 0) {
        var includes = this._config.baseEntry.includes;
        var match = includes.find(function (glob) {
          var pathGlob = path.join(_this5._config.packageName, glob);
          return minimatch(module.name, pathGlob);
        });
        return typeof match !== 'undefined';
      }
      return false;
    }
  }, {
    key: '_getAssetRenames',
    value: function _getAssetRenames(asset, bundle) {
      var _this6 = this;

      var assetRenames = [];
      if (this._config.platform === 'android') {
        console.log('Get asset renames', asset);
        assetPathUtil.getAssetPathInDrawableFolder(asset).forEach(function (relativePath) {
          assetRenames.push({
            originPath: path.resolve(_this6._config.bundleDir, relativePath),
            relativePath: relativePath,
            newPath: path.resolve(_this6._config.outputDir, bundle, relativePath)
          });
        });
      }

      return assetRenames;
    }
  }, {
    key: '_doSplit',
    value: function _doSplit() {
      var _this7 = this;

      this._splitBase();

      if (this._useCustomSplit) {
        this._customEntries.forEach(function (entry) {
          _this7._splitCustomEntry(entry);
        });
        console.log('Use custom split');
      } else {
        this._splitNonBaseModules();
      }
    }
  }, {
    key: '_splitBase',
    value: function _splitBase() {
      var _this8 = this;

      var bundleName = 'base';
      var dev = this._config.dev;
      var codes = [];
      var assetRenames = [];
      // append codes to base
      this._polyfills.forEach(function (range, index) {
        var code = _this8._codeBlob.substring(range.start, range.end);
        if (index === 1) {
          var requireAST = babylon.parse(code);
          var conditionNode = void 0;
          traverse(requireAST, {
            enter: function enter(path) {
              if (Util.isRequirePolyfillCondition(path.node, dev)) {
                conditionNode = path.node;
              }
            },
            exit: function exit(path) {}
          });
          if (conditionNode) {
            code = code.substring(0, conditionNode.start) + code.substring(conditionNode.end);
          }
        }
        codes.push(code);
      });
      this._base.forEach(function (moduleId) {
        var module = _this8._modules[moduleId];
        var code = _this8._codeBlob.substring(module.code.start, module.code.end);
        code = code.substring(0, module.idCodeRange.start) + '\"' + module.name + '\"' + code.substring(module.idCodeRange.end);
        if (module.isAsset && !!module.assetConfig) {
          assetRenames = _this8._getAssetRenames(module.assetConfig, bundleName);
          code = _this8._addBundleToAsset(module, bundleName, code);
        } else if (moduleId === _this8._baseEntryIndexModule) {
          (function () {
            var dependencies = Util.getModuleDependencyCodeRange(code, 0, code.length);

            var _loop2 = function _loop2(i) {
              if (_this8._customEntries.find(function (entry) {
                return parseInt(entry.moduleId) === parseInt(dependencies[i].module);
              })) {
                code = code.replace(dependencies[i].code, '');
              }
            };

            for (var i = dependencies.length - 1; i >= 0; i--) {
              _loop2(i);
            }
          })();
        }
        code = Util.replaceModuleIdWithName(code, _this8._modules);
        codes.push(code);
      });
      this._moduleCalls.forEach(function (moduleCall) {
        var code = _this8._codeBlob.substring(moduleCall.start, moduleCall.end);
        code = Util.replaceModuleIdWithName(code, _this8._modules);
        codes.push(code);
      });
      this._bundles.push({
        name: bundleName,
        codes: codes,
        assetRenames: assetRenames
      });
    }
  }, {
    key: '_splitCustomEntry',
    value: function _splitCustomEntry(entry) {
      var _this9 = this;

      var bundleName = entry.name;
      var codes = [];
      var assetRenames = [];
      entry.moduleSet.forEach(function (moduleId) {
        var module = _this9._modules[moduleId];
        var code = _this9._codeBlob.substring(module.code.start, module.code.end);
        code = code.substring(0, module.idCodeRange.start) + '\"' + module.name + '\"' + code.substring(module.idCodeRange.end);
        if (module.isAsset && module.assetConfig) {
          assetRenames = assetRenames.concat(_this9._getAssetRenames(module.assetConfig, bundleName));
          code = _this9._addBundleToAsset(module, bundleName, code);
        }
        code = Util.replaceModuleIdWithName(code, _this9._modules);
        codes.push(code);
      });
      var entryModuleName = this._modules[entry.moduleId].name;
      codes.push('\nrequire(\"' + entryModuleName + '\");');
      this._bundles.push({
        name: bundleName,
        codes: codes,
        assetRenames: assetRenames
      });
    }
  }, {
    key: '_splitNonBaseModules',
    value: function _splitNonBaseModules() {
      var bundleName = 'business';
      var codes = [];
      var assetRenames = [];
      for (var _moduleId2 in this._modules) {
        var moduleIdInt = parseInt(_moduleId2);

        if (this._modules.hasOwnProperty(_moduleId2) && !this._base.has(moduleIdInt)) {
          var _module2 = this._modules[moduleIdInt];
          var _code = this._codeBlob.substring(_module2.code.start, _module2.code.end);
          _code = _code.substring(0, _module2.idCodeRange.start) + '\"' + _module2.name + '\"' + _code.substring(_module2.idCodeRange.end);
          if (_module2.isAsset && _module2.assetConfig) {
            assetRenames = this._getAssetRenames(_module2.assetConfig, bundleName);
            _code = this._addBundleToAsset(_module2, bundleName, _code);
          }
          _code = Util.replaceModuleIdWithName(_code, this._modules);
          codes.push(_code);
        }
      }
      this._bundles.push({
        name: bundleName,
        codes: codes,
        assetRenames: assetRenames
      });
    }
  }, {
    key: '_addBundleToAsset',
    value: function _addBundleToAsset(module, bundleName, code) {
      var asset = module.assetConfig;
      var startInner = asset.code.start - module.code.start;
      var endInner = asset.code.end - module.code.start;
      return code.substring(0, startInner) + JSON.stringify({
        httpServerLocation: asset.httpServerLocation,
        width: asset.width,
        height: asset.height,
        scales: asset.scales,
        hash: asset.hash,
        name: asset.name,
        type: asset.type,
        bundle: bundleName
      }) + code.substring(endInner);
    }
  }]);

  return Parser;
}();

module.exports = Parser;