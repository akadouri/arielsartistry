'use strict';
// Based on https://github.com/hexojs/hexo-renderer-markdown-it

const path = require('path');
const MarkdownIt = require('markdown-it');
const {slugize, url_for} = require('hexo-util');

let markdownConfig = hexo.config.markdown;

if (typeof markdownConfig === 'string') {
  markdownConfig = {preset: markdownConfig};
  hexo.log.warn('The string markdown config is deprecated; use markdown.preset instead.');
}

markdownConfig = hexo.config.markdown = Object.assign({
  preset: 'default',
  render: {},
  anchors: {}
}, markdownConfig);

markdownConfig.render = Object.assign({
  html: true,
  xhtmlOut: false,
  breaks: true,
  linkify: true,
  typographer: true,
  quotes: '“”‘’'
}, markdownConfig.render);

markdownConfig.anchors = Object.assign({
  level: 2,
  collisionSuffix: '',
  permalink: false,
  permalinkClass: 'header-anchor',
  permalinkSide: 'left',
  permalinkSymbol: '¶',
  case: 0,
  separator: '-'
}, markdownConfig.anchors);

const parser = new MarkdownIt(markdownConfig.preset, markdownConfig.render);

if (markdownConfig.enable_rules) {
  parser.enable(markdownConfig.enable_rules);
}

if (markdownConfig.disable_rules) {
  parser.disable(markdownConfig.disable_rules);
}

if (markdownConfig.plugins) {
  markdownConfig.plugins.forEach(pluginConfig => {
    const pluginName = typeof pluginConfig === 'string' ? pluginConfig : pluginConfig.name;
    const pluginPath = require.resolve(pluginName, {
      paths: [path.join(hexo.base_dir, 'node_modules'), hexo.base_dir]
    });
    const plugin = require(pluginPath);

    if (typeof pluginConfig === 'string') {
      parser.use(plugin);
    } else {
      parser.use(plugin, pluginConfig.options);
    }
  });
}

function addAnchors(md, options) {
  const Token = md.core.State.prototype.Token;
  let titleStore = Object.create(null);
  const originalHeadingOpen = md.renderer.rules.heading_open;
  const slugOptions = {transform: options.case, ...options};

  options.renderPermalink = function(slug, opts, tokens, index) {
    const permalink = [
      Object.assign(new Token('link_open', 'a', 1), {
        attrs: [['class', opts.permalinkClass], ['href', '#' + slug]]
      }),
      Object.assign(new Token('text', '', 0), {content: opts.permalinkSymbol}),
      new Token('link_close', 'a', -1),
      Object.assign(new Token('text', '', 0), {content: ''})
    ];

    if (opts.permalinkSide === 'right') {
      tokens[index + 1].children.push(...permalink);
    } else {
      tokens[index + 1].children.unshift(...permalink);
    }
  };

  md.renderer.rules.heading_open = function(tokens, index, renderOptions, env, self) {
    if (Number(tokens[index].tag.slice(1)) >= options.level) {
      const title = tokens[index + 1].children.reduce((result, token) => result + token.content, '');
      let slug = slugize(title, slugOptions);

      if (Object.prototype.hasOwnProperty.call(titleStore, slug)) {
        titleStore[slug] += 1;
        slug += '-' + options.collisionSuffix + titleStore[slug];
      } else {
        titleStore[slug] = 1;
      }

      tokens[index].attrPush(['id', slug]);

      if (options.permalink) {
        options.renderPermalink(slug, options, tokens, index, renderOptions, env, self);
      }
    }

    return originalHeadingOpen
      ? originalHeadingOpen.call(this, tokens, index, renderOptions, env, self)
      : self.renderToken(tokens, index, renderOptions);
  };

  md.core.ruler.push('clear_anchor_title_store', () => {
    titleStore = Object.create(null);
  });
}

function addImageHandling(md, images) {
  const {lazyload, prepend_root: prependRoot, post_asset: postAsset} = images;
  const {relative_link, model, base_dir, source_dir} = hexo;

  md.renderer.rules.image = function(tokens, index, renderOptions, env, self) {
    const token = tokens[index];
    const postPath = env.postPath;

    token.attrSet('alt', token.content);

    if (lazyload) {
      token.attrSet('loading', 'lazy');
    }

    if (!prependRoot && !postAsset) {
      return self.renderToken(tokens, index, renderOptions);
    }

    const srcIndex = token.attrs.findIndex(attribute => attribute[0] === 'src');
    let src = token.attrs[srcIndex][1];

    if (!/^(#|\/\/|http(s)?:)/.test(src) && !relative_link) {
      if (!(src.startsWith('/') || src.startsWith('\\')) && postAsset) {
        const PostAsset = model.call(hexo, 'PostAsset');
        let assetBasePath = path.posix.join(
          path.posix.basename(source_dir),
          path.posix.dirname(path.posix.relative(source_dir, postPath)),
          path.posix.basename(postPath, path.extname(postPath))
        );

        if (path.isAbsolute(assetBasePath)) {
          assetBasePath = path.relative(base_dir, assetBasePath);
        }

        assetBasePath = assetBasePath.replace(/\\/g, '/');

        const asset = [
          path.posix.join(assetBasePath, src),
          path.posix.join(assetBasePath, src.replace(new RegExp('^' + path.posix.basename(postPath, path.extname(postPath)) + '/'), ''))
        ].map(id => PostAsset.findById(id)).filter(Boolean);

        if (asset.length) {
          src = asset[0].path.replace(/\\/g, '/');
        }
      }

      token.attrSet('src', url_for.call(hexo, src));
    }

    return self.renderToken(tokens, index, renderOptions);
  };
}

if (markdownConfig.anchors) {
  addAnchors(parser, markdownConfig.anchors);
}

if (markdownConfig.images) {
  addImageHandling(parser, markdownConfig.images);
}

const renderer = {
  hexo,
  parser,

  render(data, options) {
    this.hexo.execFilterSync('markdown-it:renderer', this.parser, {context: this});

    const env = {postPath: data.path};

    if (options && options.inline === true) {
      return this.parser.renderInline(data.text, env);
    }

    return this.parser.render(data.text, env);
  }
};

function render(data, options) {
  return renderer.render(data, options);
}

render.disableNunjucks = Boolean(markdownConfig.disableNunjucks);

for (const extension of ['md', 'markdown', 'mkd', 'mkdn', 'mdwn', 'mdtxt', 'mdtext']) {
  hexo.extend.renderer.register(extension, 'html', render, true);
}
