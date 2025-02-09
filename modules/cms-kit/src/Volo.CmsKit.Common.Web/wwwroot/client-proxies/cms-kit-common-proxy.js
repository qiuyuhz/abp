/* This file is automatically generated by ABP framework to use MVC Controllers from javascript. */


// module cms-kit-common

(function(){

  // controller volo.cmsKit.blogs.blogFeature

  (function(){

    abp.utils.createNamespace(window, 'volo.cmsKit.blogs.blogFeature');

    volo.cmsKit.blogs.blogFeature.getOrDefault = function(blogId, featureName, ajaxParams) {
      return abp.ajax($.extend(true, {
        url: abp.appPath + 'api/cms-kit/blogs/' + blogId + '/features/' + featureName + '',
        type: 'GET'
      }, ajaxParams));
    };

  })();

  // controller volo.cmsKit.mediaDescriptors.mediaDescriptor

  (function(){

    abp.utils.createNamespace(window, 'volo.cmsKit.mediaDescriptors.mediaDescriptor');

    volo.cmsKit.mediaDescriptors.mediaDescriptor.download = function(id, ajaxParams) {
      return abp.ajax($.extend(true, {
        url: abp.appPath + 'api/cms-kit/media/' + id + '',
        type: 'GET'
      }, ajaxParams));
    };

  })();

})();


