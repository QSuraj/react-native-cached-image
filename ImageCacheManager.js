'use strict';

const _isString = require('lodash/isString');
const _startsWith = require('lodash/startsWith');
const _defaults = require('lodash/defaults');
const fsUtils = require('./utils/fsUtils');
const pathUtils = require('./utils/pathUtils');
const MemoryCache = require('react-native-cacher/MemoryCache').default;

module.exports = (defaultOptions = {}, urlCache = MemoryCache, fs = fsUtils, path = pathUtils) => {

    const defaultDefaultOptions = {
        headers: {},
        ttl: 60 * 60 * 24 * 14, // 2 weeks
        useQueryParamsInCacheKey: false,
        cacheLocation: fs.getCacheDir(),
        allowSelfSignedSSL: false,
    };

    // apply default options
    _defaults(defaultOptions, defaultDefaultOptions);

    function isCacheable(url) {
        return _isString(url) && (_startsWith(url.toLowerCase(), 'http://') || _startsWith(url.toLowerCase(), 'https://'));
    }

    function cacheUrl(url, options, getCachedFile) {
        if (!isCacheable(url)) {
            return Promise.reject(new Error(`Url is not cacheable ${url}`));
        }
        // allow CachedImage to provide custom options
        _defaults(options, defaultOptions);
        // cacheableUrl contains only the needed query params
        const cacheableUrl = path.getCacheableUrl(url, options.useQueryParamsInCacheKey);
        // note: urlCache may remove the entry if it expired so we need to remove the leftover file manually
        return urlCache.get(cacheableUrl)
            .then(fileRelativePath => {
                if (!fileRelativePath) {
                    // console.log('ImageCacheManager: url cache miss', cacheableUrl);
                    throw new Error('URL expired or not in cache');
                }
                // console.log('ImageCacheManager: url cache hit', cacheableUrl);
                const cachedFilePath = `${options.cacheLocation}/${fileRelativePath}`;

                const ext = cachedFilePath.substr(cachedFilePath.lastIndexOf('.') + 1);

                return fs.exists(cachedFilePath)
                    .then((exists) => {
                        if (exists) {
                            return { filePath: cachedFilePath, fileType: ext }
                        } else {
                            throw new Error('file under URL stored in url cache doesn\'t exists');
                        }
                    });
            })
            // url is not found in the cache or is expired
            .catch(() => {
                let fileRelativePath = path.getImageRelativeFilePath(cacheableUrl);
                let filePathBefore = `${options.cacheLocation}/${fileRelativePath}`

                // remove expired file if exists
                return fs.deleteFile(filePathBefore)
                    // get the image to cache (download / copy / etc)
                    .then(() => getCachedFile(filePathBefore))
                    // add to cache
                    .then(( filePath ) => {
                        filePathBefore = filePath
                        const fileType = filePath.substr(filePath.lastIndexOf('.') + 1);
                        const fileRelativePathType = fileRelativePath.substr( fileRelativePath.lastIndexOf( '.' ) + 1 );
                        fileRelativePath = fileRelativePath.replace( fileRelativePathType, fileType );
                        return urlCache.set(cacheableUrl, fileRelativePath, options.ttl).then(() => { 
                            return { filePath: filePathBefore, fileType } 
                        });
                    })
            });
    }

    return {

        /**
         * download an image and cache the result according to the given options
         * @param url
         * @param options
         * @returns {Promise}
         */
        downloadAndCacheUrl(url, options = {}) {
            return cacheUrl(
                url,
                options,
                filePath => fs.downloadFile(url, filePath, options.headers)
            );
        },

        /**
         * seed the cache for a specific url with a local file
         * @param url
         * @param seedPath
         * @param options
         * @returns {Promise}
         */
        seedAndCacheUrl(url, seedPath, options = {}) {
            return cacheUrl(
                url,
                options,
                filePath => fs.copyFile(seedPath, filePath)
            );
        },

        /**
         * delete the cache entry and file for a given url
         * @param url
         * @param options
         * @returns {Promise}
         */
        deleteUrl(url, options = {}) {
            if (!isCacheable(url)) {
                return Promise.reject(new Error('Url is not cacheable'));
            }
            _defaults(options, defaultOptions);
            const cacheableUrl = path.getCacheableUrl(url, options.useQueryParamsInCacheKey);
            const filePath = path.getImageFilePath(cacheableUrl, options.cacheLocation);
            // remove file from cache
            return urlCache.remove(cacheableUrl)
                // remove file from disc
                .then(() => fs.deleteFile(filePath));
        },

        /**
         * delete all cached file from the filesystem and cache
         * @param options
         * @returns {Promise}
         */
        clearCache(options = {}) {
            _defaults(options, defaultOptions);
            return urlCache.flush()
                .then(() => fs.cleanDir(options.cacheLocation));
        },

        /**
         * return info about the cache, list of files and the total size of the cache
         * @param options
         * @returns {Promise.<{file: Array, size: Number}>}
         */
        getCacheInfo(options = {}) {
            _defaults(options, defaultOptions);
            return fs.getDirInfo(options.cacheLocation);
        },

    };
};
