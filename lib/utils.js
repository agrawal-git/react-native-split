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

'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.isReactNativeEntry = isReactNativeEntry;
exports.isAssetModule = isAssetModule;
exports.isEmptyStmt = isEmptyStmt;
exports.getAssetConfig = getAssetConfig;
exports.isModuleCall = isModuleCall;
exports.isRequirePolyfillCondition = isRequirePolyfillCondition;
exports.isPolyfillCall = isPolyfillCall;
exports.isModuleDeclaration = isModuleDeclaration;
exports.replaceModuleIdWithName = replaceModuleIdWithName;
exports.getModuleDependency = getModuleDependency;
exports.getModuleDependencyCodeRange = getModuleDependencyCodeRange;
exports.ensureFolder = ensureFolder;
var fs = require('fs');
var path = require('path');
var MODULE_REGEX = /require\s?\(([0-9]+)[^)]*\)/g;
var EXPR_STMT = 'ExpressionStatement';
var EMPTY_STMT = 'EmptyStatement';
var IF_STMT = 'IfStatement';

var BINARY_EXPR = 'BinaryExpression';
var LOGICAL_EXPR = 'LogicalExpression';
var UNARY_EXPR = 'UnaryExpression';
var CALL_EXPR = 'CallExpression';
var FUNC_EXPR = 'FunctionExpression';
var COND_EXPR = 'ConditionalExpression';
var IDENTIFIER = 'Identifier';
var LITERAL_NUM = 'NumericLiteral';
var LITERAL_STR = 'StringLiteral';

var DEFAULT_ASSET_EXTS = ['bmp', 'gif', 'jpg', 'jpeg', 'png', 'psd', 'svg', 'webp', // Image formats
'm4v', 'mov', 'mp4', 'mpeg', 'mpg', 'webm', // Video formats
'aac', 'aiff', 'caf', 'm4a', 'mp3', 'wav', // Audio formats
'html', 'pdf'];

function isReactNativeEntry(moduleName) {
  return moduleName === 'react-native-implementation' || moduleName === 'react-native/Libraries/react-native/react-native.js';
}

function isAssetModule(moduleName) {
  var ext = moduleName.substring(moduleName.lastIndexOf('.') + 1);
  return DEFAULT_ASSET_EXTS.indexOf(ext) > 0;
}

function isEmptyStmt(node) {
  try {
    return node.type === EMPTY_STMT;
  } catch (e) {
    return false;
  }
}

function getAssetConfig(node) {
  var func = node.expression.arguments[0];
  var rhs = func.body.body[0].expression.right; //require(240).registerAsset({...})
  var propNode = rhs.arguments[0].properties; // {...}
  var assetConfig = {
    code: {
      start: rhs.arguments[0].start,
      end: rhs.arguments[0].end
    }
  };
  propNode.forEach(function (prop) {
    var key = prop.key.value ? prop.key.value : prop.key.name;
    if (key === 'scales') {
      var value = [];
      prop.value.elements.forEach(function (scaleNode) {
        value.push(scaleNode.value);
      });
      assetConfig[key] = value;
    } else {
      assetConfig[key] = prop.value.value;
    }
  });
  return assetConfig;
}

function isModuleCall(node) {
  try {
    return node.type === EXPR_STMT && node.expression.type === CALL_EXPR && node.expression.callee.type === IDENTIFIER && node.expression.callee.name === 'require' && node.expression.arguments.length === 1 && node.expression.arguments[0].type === LITERAL_NUM;
  } catch (e) {
    return false;
  }
}

function isRequirePolyfillCondition(node, dev) {
  if (node.type === IF_STMT && node.test.type === LOGICAL_EXPR && node.test.left.name === '__DEV__' && node.test.operator === '&&' && node.test.right.type === BINARY_EXPR) {
    var binaryExpr = node.test.right;
    if (dev) {
      return binaryExpr.left.operator === 'typeof' && binaryExpr.operator === '===' && binaryExpr.right.type === LITERAL_STR;
    } else {
      return binaryExpr.left.type === LITERAL_STR && binaryExpr.operator === '==' && binaryExpr.right.operator === 'typeof';
    }
  }
}

function isPolyfillCall(node, dev) {
  try {
    var isPolyfillCallExpr = function isPolyfillCallExpr(expr) {
      return expr.type === CALL_EXPR && expr.callee.type === FUNC_EXPR && expr.callee.params.length === 1 && expr.callee.params[0].type === IDENTIFIER && expr.arguments.length === 1 && expr.arguments[0].type === COND_EXPR;
    };
    if (dev) {
      return node.type === EXPR_STMT && isPolyfillCallExpr(node.expression);
    } else {
      return node.type === EXPR_STMT && node.expression.type === UNARY_EXPR && isPolyfillCallExpr(node.expression.argument);
    }
  } catch (e) {
    return false;
  }
}

function isModuleDeclaration(node) {
  try {
    return node.type === EXPR_STMT && node.expression.type === CALL_EXPR && node.expression.callee.type === IDENTIFIER && node.expression.callee.name === '__d';
  } catch (e) {
    return false;
  }
}

function replaceModuleIdWithName(codeBlob, modules) {
  var dependencies = getModuleDependencyCodeRange(codeBlob, 0, codeBlob.length);
  if (dependencies) {
    dependencies.forEach(function (deps) {
      var moduleName = modules[deps.module].name;
      codeBlob = codeBlob.replace(deps.code, 'require(\"' + moduleName + '\")');
    });
  }
  return codeBlob;
}

function getModuleDependency(codeBlob, start, end) {
  var dependency = [];
  var bodyString = codeBlob.substring(start, end);
  var result = void 0;
  while (result = MODULE_REGEX.exec(bodyString)) {
    dependency.push(parseInt(result[1]));
  }
  return dependency;
}

function getModuleDependencyCodeRange(codeBlob, start, end) {
  var dependency = [];
  var bodyString = codeBlob.substring(start, end);
  var result = void 0;
  while (result = MODULE_REGEX.exec(bodyString)) {
    dependency.push({
      code: result[0],
      module: parseInt(result[1])
    });
  }
  return dependency;
}

function ensureFolder(dir) {
  try {
    fs.accessSync(dir, fs.F_OK);
    return true;
  } catch (e) {
    fs.mkdirSync(dir);
    return false;
  }
}

// export function resolvePathArrays(root: string, array : Array<any>, val ?: string) : Array<any> {
//   const newArr = [];
//   array.forEach(item => {
//     if (val) {
//       let newItem = Object.assign({}, item);
//       newItem[val] = path.resolve(root, item[val]);
//       newArr.push(newItem);
//     } else if (typeof item === 'string') {
//       newArr.push(path.resolve(root, item));
//     }
//   });
//   return newArr;
// }