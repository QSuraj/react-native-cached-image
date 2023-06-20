'use strict';

const _omit = require('lodash/omit');
const _isEqual = require('lodash/isEqual');
const _keys = require('lodash/keys');
const _pick = require('lodash/pick');
const _get = require('lodash/get');
import { Svg, SvgFromUri, SvgFromXml, SvgUri, SvgXml } from "react-native-svg";
const React = require('react');
const ReactNative = require('react-native');
const sharp = require('sharp');

const PropTypes = require('prop-types');

const ImageCacheManagerOptionsPropTypes = require('./ImageCacheManagerOptionsPropTypes');

const flattenStyle = ReactNative.StyleSheet.flatten;

const ImageCacheManager = require('./ImageCacheManager');

const {
    View,
    ImageBackground,
    ActivityIndicator,
    Platform,
    StyleSheet,
} = ReactNative;
import NetInfo from "@react-native-community/netinfo";
import RNFetchBlob from "rn-fetch-blob";
import { err, fetchText } from "react-native-svg/src/xml";

const styles = StyleSheet.create({
    image: {
        backgroundColor: 'transparent'
    },
    loader: {
        backgroundColor: 'transparent',
    },
    loaderPlaceholder: {
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center'
    }
});

function getImageProps(props) {
    return _omit(props, ['source', 'defaultSource', 'fallbackSource', 'LoadingIndicator', 'activityIndicatorProps', 'style', 'useQueryParamsInCacheKey', 'renderImage', 'resolveHeaders']);
}

class CachedImage extends React.Component {

    static propTypes = {
        renderImage: PropTypes.func.isRequired,
        activityIndicatorProps: PropTypes.object.isRequired,
        // ImageCacheManager options
        ...ImageCacheManagerOptionsPropTypes,
    };

    static defaultProps = {
            renderImage: props => (<ImageBackground imageStyle={props.style} ref={this.cachedImageRef} {...props} />),
            activityIndicatorProps: {},
    };

    static contextTypes = {
        getImageCacheManager: PropTypes.func,
    };

    constructor(props) {
        super(props);
        this._isMounted = false;
        this.state = {
            isCacheable: true,
            cachedImagePath: null,
            networkAvailable: true,
            cachedImageType: null,
            xml: null
        };

        this.getImageCacheManagerOptions = this.getImageCacheManagerOptions.bind(this);
        this.getImageCacheManager = this.getImageCacheManager.bind(this);
        this.safeSetState = this.safeSetState.bind(this);
        this.handleConnectivityChange = this.handleConnectivityChange.bind(this);
        this.processSource = this.processSource.bind(this);
        this.renderLoader = this.renderLoader.bind(this);
    }

    componentDidMount(){
        this.cachedImageRef = React.createRef();
        this._isMounted = true;

        this.unsubscribeNetInfo = NetInfo.addEventListener( ( state ) => {
            this.handleConnectivityChange( state.isConnected );
        } );

        // initial
        NetInfo.fetch().then(state => {
            this.safeSetState({
                networkAvailable: state.isConnected
            });
        });

        this.processSource(this.props.source);
    }

    componentWillUnmount() {
        this._isMounted = false;
        this.unsubscribeNetInfo();
    }

    UNSAFE_componentWillReceiveProps(nextProps) {
        if (!_isEqual(this.props.source, nextProps.source)) {
            this.processSource(nextProps.source);
        }
    }

    setNativeProps(nativeProps) {
        try {
            this.cachedImageRef.setNativeProps(nativeProps);
        } catch (e) {
            console.error(e);
        }
    }

    getImageCacheManagerOptions() {
        return _pick(this.props, _keys(ImageCacheManagerOptionsPropTypes));
    }

    getImageCacheManager() {
        // try to get ImageCacheManager from context
        if (this.context && this.context.getImageCacheManager) {
            return this.context.getImageCacheManager();
        }
        // create a new one if context is not available
        const options = this.getImageCacheManagerOptions();
        return ImageCacheManager(options);
    }

    safeSetState(newState) {
        if (!this._isMounted) {
            return;
        }
        return this.setState(newState);
    }

    handleConnectivityChange(isConnected) {
        this.safeSetState({
            networkAvailable: isConnected
        });
    }

    processSource(source) {
        const url = _get(source, ['uri'], null);
        const options = this.getImageCacheManagerOptions();
        const imageCacheManager = this.getImageCacheManager();

        imageCacheManager.downloadAndCacheUrl(url, options)
            .then(cachedImagePathObject => {
                this.safeSetState({
                    cachedImagePath: cachedImagePathObject.filePath,
                    cachedImageType: cachedImagePathObject.fileType
                });
            })
            .catch(err => {
                console.error(err);
                this.safeSetState({
                    cachedImagePath: null,
                    cachedImageType: null,
                    isCacheable: false
                });
            });
    }

    async readXmlFromFile(){
      const source = (this.state.isCacheable && this.state.cachedImagePath) ? {
        uri: 'file://' + this.state.cachedImagePath
    } : this.props.source;
      await fetch(source.uri)
      .then((response) => response.text())
      .then((xml) =>{
        this.setState({xml})
      }).catch((err)=>{
        console.log("error", err)
      });
    }

    componentDidUpdate(prevProps, prevState){
      if( this.state.cachedImageType === 'svg+xml' && this.state.xml === null ){
        this.readXmlFromFile()
      }
    }

    render() {
        if (this.state.isCacheable && !this.state.cachedImagePath) {
            return this.renderLoader();
        }

        const props = getImageProps(this.props);
        const style = this.props.style || styles.image;
        const source = (this.state.isCacheable && this.state.cachedImagePath) ? {
            uri: 'file://' + this.state.cachedImagePath
        } : this.props.source;

        if(this.state.cachedImageType === 'gif' && Platform.OS === this.props.alternateOS){
            return this.props.alternateView ? this.props.alternateView : this.props.renderImage({
                ...props,
                key: props.key || source.uri,
                style,
                source
            });;
        }
        
        if(this.state.cachedImageType === 'svg+xml' && this.state.xml !== null){
            return (
                <SvgXml
                    {...props}
                    xml={this.state.xml}
                    style={style}
                    width="100%"
                    height="100%"
                    key={props.key || source.uri} />
            );
        }

        if (this.props.fallbackSource && !this.state.cachedImagePath) {
            return this.props.renderImage({
                ...props,
                key: `${props.key || source.uri}error`,
                style,
                source: this.props.fallbackSource
            });
        }

        return this.props.renderImage({
            ...props,
            key: props.key || source.uri,
            style,
            source
        });
    }

    renderLoader() {
        const imageProps = getImageProps(this.props);
        const imageStyle = [this.props.style, styles.loaderPlaceholder];

        const activityIndicatorProps = _omit(this.props.activityIndicatorProps, ['style']);
        const activityIndicatorStyle = this.props.activityIndicatorProps.style || styles.loader;

        const LoadingIndicator = this.props.loadingIndicator;

        const source = this.props.defaultSource;

        // if the imageStyle has borderRadius it will break the loading image view on android
        // so we only show the ActivityIndicator
        if (!source || (Platform.OS === 'android' && flattenStyle(imageStyle).borderRadius)) {
            if (LoadingIndicator) {
                return (
                    <View style={[imageStyle, activityIndicatorStyle]}>
                        <LoadingIndicator {...activityIndicatorProps} />
                    </View>
                );
            }
            return (
                <ActivityIndicator
                    {...activityIndicatorProps}
                    style={[imageStyle, activityIndicatorStyle]}/>
            );
        }
        // otherwise render an image with the defaultSource with the ActivityIndicator on top of it
        return this.props.renderImage({
            ...imageProps,
            style: imageStyle,
            key: source.uri,
            source,
            children: (
                LoadingIndicator
                    ? <View style={[imageStyle, activityIndicatorStyle]}>
                    <LoadingIndicator {...activityIndicatorProps} />
                </View>
                    : <ActivityIndicator
                    {...activityIndicatorProps}
                    style={activityIndicatorStyle}/>
            )
        });
    }

}

module.exports = CachedImage;
