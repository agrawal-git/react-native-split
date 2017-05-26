/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 * @flow
 */

import {
  AppRegistry,
} from 'react-native';

//生产时构建无用，开发时可以切换模块
import SampleA from './src/components/packagea/SampleA';
AppRegistry.registerComponent('splitexp', () => SampleA);

export default SampleA;