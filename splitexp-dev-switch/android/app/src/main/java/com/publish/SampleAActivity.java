package com.publish;

public class SampleAActivity extends BaseSubBundleActivity {

    @Override
    protected String getScriptAssetPath() {
        return "bundle/sample_a/index.bundle";
    }

    @Override
    protected String getMainComponentName() {
        return "SampleA";
    }

}
