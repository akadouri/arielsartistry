'use strict';

const ejs = require('ejs');

function render(data, options) {
  return ejs.render(data.text, Object.assign({filename: data.path}, options));
}

render.compile = function(data) {
  return ejs.compile(data.text, {
    filename: data.path
  });
};

hexo.extend.renderer.register('ejs', 'html', render, true);
