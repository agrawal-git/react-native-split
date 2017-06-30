#!/bin/bash
#发布前构建配置,jeemuu

mkdir build
node ./splitppk.js --platform android --output build --config .splitconfig --dev false

mkdir -p android/app/src/main/assets/bundle
rm -rf android/app/src/main/assets/bundle/*
cp -R build/bundle-output/split/* android/app/src/main/assets/bundle
cd android
./gradlew :app:installDebug
adb shell am start -n com.splitexp/com.publish.MainActivity

    
    