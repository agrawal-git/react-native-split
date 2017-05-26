# splitexp-dev-switch

## 简介
这个例子验证了split模块，可以支持发布前构建与开发时热更新，没有冲突，简单切换配置可以实现，配置如下。

--------
## 开发时，启动热更新构建，运行程序
1. 修改AndroidManifest.xml，注释<!--发布前构建配置-->，打开<!--开发时配置，支持热更新-->配置
````
<!--开发时配置，支持热更新-->
 android:name=".MainApplication"
 android:name=".MainActivity"
````

2. 修改index.android.js，改为需要开发的模块，例如模块A
````
import {
  AppRegistry,
} from 'react-native';

//生产时构建无用，开发时可以切换模块
import SampleA from './src/components/packagea/SampleA';
AppRegistry.registerComponent('splitexp', () => SampleA);

export default SampleA;
````

3. 运行react-native run-android

-------- 
## 发布时，启动拆包构建，运行程序

1. 修改AndroidManifest配置，运行./run-example.sh
````
<!--发布前构建配置-->
 android:name="com.publish.MainApplication"
 android:name="com.publish.MainActivity"
````
---------

## 验证修改配置后，同一个子包拆包结果基本一致
删除拆分a包配置后的拆分结果，与之前拆分结果一致，base/index.bundle.js略有差异，但是相互替换，可正常运行
````
  "custom": [ {
    "name": "sample_b",
    "index": "./src/components/packageb/SampleB.js"
  }]
````
<image src="./res/bundlebc.png"/>

