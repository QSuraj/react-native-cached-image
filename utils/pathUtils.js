'use strict';

const _isArray = require('lodash/isArray');
const _pick = require('lodash/pick');
const _toLower = require('lodash/toLower');
const _ = require('lodash');
const URL = require('url-parse');
const SHA1 = require("crypto-js/sha1");

const defaultImageTypes = ['png', 'jpeg', 'jpg', 'gif', 'bmp', 'tiff', 'tif'];

function serializeObjectKeys(obj) {
    return _(obj)
        .toPairs()
        .sortBy(a => a[0])
        .map(a => a[1])
        .value();
}

function getQueryForCacheKey(url, useQueryParamsInCacheKey) {
    if (_isArray(useQueryParamsInCacheKey)) {
        return serializeObjectKeys(_pick(url.query, useQueryParamsInCacheKey));
    }
    if (useQueryParamsInCacheKey) {
        return serializeObjectKeys(url.query);
    }
    return '';
}

function generateCacheKey(url, useQueryParamsInCacheKey = true) {
    const parsedUrl = new URL(url, null, true);

    const pathParts = parsedUrl.pathname.split('/');

    // last path part is the file name
    const fileName = pathParts.pop();
    const filePath = pathParts.join('/');

    const parts = fileName.split('.');
    const fileType = parts.length > 1 ? _toLower(parts.pop()) : '';
    const type = defaultImageTypes.includes(fileType) ? fileType : 'jpg';

    const cacheable = filePath + fileName + type + getQueryForCacheKey(parsedUrl, useQueryParamsInCacheKey);
    return SHA1(cacheable) + '.' + type;
}

function getHostCachePathComponent(url) {
    const {
        host
    } = new URL(url);

    return host.replace(/\.:/gi, '_').replace(/[^a-z0-9_]/gi, '_').toLowerCase()
      + '_' + SHA1(host);
}

/**
 * handle the resolution of URLs to local file paths
 */
module.exports = {

    /**
     * Given a URL and some options returns the file path in the file system corresponding to it's cached image location
     * @param url
     * @param cacheLocation
     * @returns {string}
     */
    getImageFilePath(url, cacheLocation) {
        const hostCachePath = getHostCachePathComponent(url);
        const cacheKey = generateCacheKey(url);

        return `${cacheLocation}/${hostCachePath}/${cacheKey}`;
    },

    /**
     * Given a URL returns the relative file path combined from host and url hash
     * @param url
     * @returns {string}
     */

    getImageRelativeFilePath(url) {
        const hostCachePath = getHostCachePathComponent(url);
        const cacheKey = generateCacheKey(url);

        return `${hostCachePath}/${cacheKey}`;
    },


    /**
     * returns the url after removing all unused query params
     * @param url
     * @param useQueryParamsInCacheKey
     * @returns {string}
     */
    getCacheableUrl(url, useQueryParamsInCacheKey) {
        const parsedUrl = new URL(url, null, true);
        if (_isArray(useQueryParamsInCacheKey)) {
            parsedUrl.set('query', _pick(parsedUrl.query, useQueryParamsInCacheKey));
        }
        if (!useQueryParamsInCacheKey) {
            parsedUrl.set('query', {});
        }
        return parsedUrl.toString();
    }

};
