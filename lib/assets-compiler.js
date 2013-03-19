var fs = require('fs')
  , path = require('path')
  , utils
  , $;

/**
 * Assets compilation engine
 * Waits for requests to public assets folders and compiles
 * the files if needed
 *
 * @constructor
 */
var AssetsCompiler = module.exports = function AssetsCompiler(compound) {
    this.compound = compound;
    this.app = this.compound.app;
    this.assetDir = this.app.root + '/app/assets';
    this.publicDir = this.app.root + '/public';
    this.defaultCompilerOptions = {
      sourceDir: '',
      destDir: '',
    };

    utils = compound.utils;
    $ = utils.stylize.$;
}

AssetsCompiler.prototype.init = function() {
  /**
   * Decide which asset directories to watch and which should
   * be precompiled
   */
  var assetTypes = [{name: 'javascripts', extension: 'js'}, {name:'stylesheets', extension: 'css'}]
    , self = this;

  var precompileAssets = [];
  self.handledAssetTypes = [];

  this.compound.on('after configure', function() {

    assetTypes.forEach(function(assetType) {
      var compiler = self.getCompiler(assetType.extension);
      if (compiler) {
        precompileAssets.push(compiler.sourceExtension);
        self.handledAssetTypes.push(assetType.extension);
      }
    });

    if (precompileAssets.length > 0) {
      self.precompileAssets(precompileAssets);
    }
  });

  return function assetsCompiler(req, res, next) {
      self.handleRequest(req, res, next);
  };
};

/**
 * Precompiles assets in /app/assets/coffeescripts and /app/assets/stylesheets
 *
 * @param {Array} List of asset types that should be precompiled
 */
AssetsCompiler.prototype.precompileAssets = function(sourceExtensions) {
  var self = this;
  var log = utils.debug;

  log($('AssetsCompiler').bold + ' ' + $('Precompiling assets:').cyan + ' ' + sourceExtensions.join(', '));

  this.compound.utils.recursivelyWalkDir(this.assetDir, function(err, files) {
    if (err) throw err;

    files.forEach(function(file) {
      var match = file.match(new RegExp('^(.*)\/(.*)[.]('+sourceExtensions.join('|')+')$'));
      if(match) {
        var source = match[0]
          , folder = match[1]
          , fileName = match[2]
          , extension = match[3]
          , compiler = self.compilers[extension]
          , destFolder = folder.replace(self.assetDir+compiler.sourceDir, self.publicDir+compiler.destDir)
          , dest = destFolder + '/' + fileName + '.' + compiler.destExtension;

        if (!compiler.ignore(source)) {
          self.compileAsset(source, dest, compiler, function(err) {
            if (err) {
              log($('AssetsCompiler').bold + ' ' + $('Compilation of ' + source.replace(self.assetDir, '') + ' failed: ').red + err);
            }
          }, true);
        }
      }
    });
  });
};

/**
 * Listens to /stylesheets and /javascripts requests and
 * delegates the requests to the static middleware after
 * conditionally compiling the source files (e.g. coffee)
 *
 * @param {Array} List of asset types that should be compiled on request
 */
AssetsCompiler.prototype.handleRequest = function(req, res, next) {
  var match
    , self = this
    , path = this.publicDir + req.path;
  if (match = path.match(new RegExp('^(.*)\/(.*)[.]('+this.handledAssetTypes.join('|')+')$'))) {
    var dest = match[0]
      , folder = match[1]
      , fileName = match[2]
      , extension = match[3]
      , compiler = this.getCompiler(extension);

    if(compiler) {
      var sourceFolder = folder.replace(self.publicDir+compiler.destDir, self.assetDir+compiler.sourceDir)
        , source = sourceFolder + '/' + fileName + '.' + compiler.sourceExtension;
      this.compileAsset(source, dest, compiler, function(err) {
        if (err) {
          throw new Error('Asset compilation failed: ' + err);
        }
      });
    }
  }
  next();
};

/**
* Returns the correct Compiler for the given extension
* @param {String} extension
*/
AssetsCompiler.prototype.getCompiler = function(extension) {
  var compiler, compilerName;
  var log = utils.debug;

  switch (extension) {
    case 'js':
      compilerName = this.app.settings.jsEngine;
      break;
    case 'css':
      compilerName = this.app.settings.cssEngine;
      break;
    default:
      break;
  }

  if (compilerName) {
    if(!(compiler = this.compilers[compilerName])) {
      log($('AssetsCompiler').bold + ' ' + $('Compiler ' + $(compilerName).bold + ' not implemented').red);
    }
  }
  return compiler;
}

/**
 * Checks for source file, compiles it and saves the
 * compiled source if the destination file is older than the source
 * file or if the destination file doesnt exist
 *
 * @param {String} filename of asset without extension
 * @param {String} relative path to folder containing asset
 * @param {Object} compiler
 * @return {Boolean} whether a file has been compiled
 */
AssetsCompiler.prototype.compileAsset = function(sourcePath, destPath, compiler, callback, force) {
  var self = this;
  var log = utils.debug;
  if (!callback) var callback = function() {};

  // options for compiler
  var options = {
    sourceDir:  sourcePath.match(/(.*)\/|\\/)[1],
    destDir: destPath.match(/(.*)\//)[1],
    sourceFileName: sourcePath.match(/([^/\\]+)$/)[1],
    destFileName: destPath.match(/([^/\\]+)$/)[1]
  };

  if (compiler.options)
    options = utils.safe_merge(options, compiler.options)

  // if `sourcePath` doesnt exist, we don't need to compile
  if (!fs.existsSync(sourcePath)) {
    return callback(null, false);
  }

  // if `destPath` doesnt exist or `sourcePath` is older than `destPath`
  //   => compile!
  var doCompile = force || false;

  if (!doCompile) {
    if (fs.existsSync(destPath)) {
      var destStat = fs.statSync(destPath)
        , sourceStat = fs.statSync(sourcePath);

      if (sourceStat.mtime > destStat.mtime) {
        doCompile = true;
      }
    } else {
      doCompile = true;
    }
  }

  doCompile = doCompile || this.dependenciesModified(sourcePath, destStat);
  // make sure that the destination path exists
  // actually compile
  if (doCompile) {
    self.compound.utils.ensureDirectoryExists(path.dirname(destPath));

    var code = fs.readFileSync(sourcePath).toString();
    this.updateDependencies(sourcePath, code, compiler);


    compiler.render(code, options, function(err, compiledCode) {
      if(err) {
        return callback(err);
      }

      fs.writeFileSync(destPath, compiledCode);

      callback(null, true);
      log($('AssetsCompiler').bold + ' ' + $(options.sourceFileName).cyan + ' => ' + $(options.destFileName).green);
    });
  } else {
    callback(null, false);
  }

  return doCompile;
};

AssetsCompiler.prototype.dependenciesModified = function(sourcePath, destStat) {

  var deps = this.dependencies[sourcePath] || {};

  for (var dep in deps) {
    try {
      var depStat = fs.statSync(dep);

      if (depStat.mtime > destStat.mtime) {
        return true;
      } else {
        return this.dependenciesModified(dep, destStat);
      }

    } catch (e) {
      delete this.dependencies[sourcePath][dep];
      delete this.dependencies[dep];
    }
  }

  return false;

}

AssetsCompiler.prototype.updateDependencies = function(sourcePath, code, compiler) {

  var deps = [];

  this.dependencies[sourcePath] = this.dependencies[sourcePath] || {};

  if (compiler.getDependencies) {
    deps = compiler.getDependencies(sourcePath, code);
  }

  for (var i in deps) {
    this.dependencies[sourcePath][deps[i]] = null;
  }

  return this.dependencies[sourcePath];
};

AssetsCompiler.prototype.dependencies = {};

AssetsCompiler.prototype.compilers = {};

/**
* Adds a new compiler.
* @param {String||[String,...]} extensions: string or array of strings that represent
*   the extensions this compiler handles
* @param {Object} options: should contain a render function, and any other options for the compiler
*/
AssetsCompiler.prototype.add = function(extensions, options) {
  var self = this;
  extensions = extensions instanceof Array ? extensions : [extensions];
  extensions.forEach(function(extension) {
    self.compilers[extension] = {};
    self.configure(extension, self.defaultCompilerOptions);
    self.configure(extension, options);
  });
  return this;
}

/**
* Configuers an existing compiler
* @param {String} extension: the extension for the compiler to be configured
* @param {Object} options: the options to be set on the compiler object
*/
AssetsCompiler.prototype.configure = function(extension, options) {
  var compiler = this.compilers[extension], key;
  if (compiler) {
    for (key in options) {
      if (options.hasOwnProperty(key) ) {
        compiler[key] = options[key];
      }
    }
  }
  return this;
}
