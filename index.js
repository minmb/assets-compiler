var AssetsCompiler = require('./lib/assets-compiler');

exports.compilers = require('./lib/compilers');

exports.init = function(compound) {
    compound.assetsCompiler = new AssetsCompiler(compound);
    compound.injectMiddlewareAfter('expressInit', compound.assetsCompiler.init());
};
