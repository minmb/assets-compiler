/* -*- mode: javascript; tab-width: 2; indent-tabs-mode: nil -*- */

module.exports = {
  coffee: {
    render: function(str, options, fn) {
      var uglify = require('uglify-js');
      this.coffee =  this.coffee || require('coffee-script');
      try {
        var result = this.coffee.compile(str)
        if (self.app.enabled('minify')){
          var minify = uglify.minify(result, {fromString:true})
          result = minify.code;
        }
        fn(null, result);
      } catch (err) {
        fn(err);
      }
    },
    sourceDir: '/coffeescripts',
    destDir: '/javascripts',
    sourceExtension: 'coffee',
    destExtension: 'js'
  },

  stylus: {
    render: function(str, options, fn) {
      var style;

      this.stylus = this.stylus || require('stylus');
      options.paths = (options.paths || []).concat([options.sourceDir]);
      style = this.stylus(str, options);
      if(this.use) {
        var use = this.use instanceof Array ? this.use : [this.use];
        for(var i = 0; i < use.length; i++) {
          style.use(use[i]);
        }
      }
      try {
        style.render(fn);
      } catch (err) {
        fn(err);
      }
    },
    sourceExtension: 'styl',
    destExtension: 'css'
  },

  sass: {
    render: function(str, options, fn) {
      this.sass = this.sass || require('sass');
      try {
        fn(null, this.sass.render(str));
      } catch (err) {
        fn(err);
      }
    },
    sourceExtension: 'sass',
    destExtension: 'css'
  },

  less: {
    render: function(str, options, fn) {
      this.less = this.less || require('less');
      try {
        var parser = new(this.less.Parser)({
            paths: [options.sourceDir]
        });
        parser.parse(str, function (e, tree) {
          if (e) {throw e;}
          fn(null, tree.toCSS());
        });
      } catch (err) {
        fn(err);
      }
    },
    sourceExtension: 'less',
    destExtension: 'css'
  }
}