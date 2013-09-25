var gethub = require('gethub');
var relative = require('path').relative;
var join = require('path').join;
var dirname = require('path').dirname;
var fs = require('fs');
var mkdirp = require('mkdirp').sync;
var rimraf = require('rimraf').sync;
var falafel = require('falafel');

rimraf(__dirname + '/addon');
rimraf(__dirname + '/keymap');
rimraf(__dirname + '/mode');
rimraf(__dirname + '/src');
rimraf(__dirname + '/theme');
rimraf(__dirname + '/codemirror.css');
rimraf(__dirname + '/codemirror.js');


function read(dest) {
  return (fs.readFileSync(join(__dirname, dest)).toString());
}
function move(src, dest) {
  mkdirp(dirname(join(__dirname, dest)));
  fs.renameSync(join(__dirname, 'src', src), join(__dirname, dest));
}
function readdir(src) {
  return fs.readdirSync(join(__dirname, 'src', src));
}

gethub('marijnh', 'CodeMirror', 'master', join(__dirname, 'src'), function (err) {
  rimraf(__dirname + '/src/doc');
  rimraf(__dirname + '/src/index.html');
  rimraf(__dirname + '/src/package.json');
  rimraf(__dirname + '/src/mode/index.html');
  rimraf(__dirname + '/src/mode/meta.js');

  move('lib/codemirror.js', 'codemirror.js');
  move('lib/codemirror.css', 'codemirror.css');

  readdir('theme').forEach(function (theme) {
    move('theme/' + theme, 'theme/' + theme);
  });

  readdir('mode').forEach(function (mode) {
    if (mode === 'rpm') return;
    move('mode/' + mode + '/' + mode + '.js', 'mode/' + mode + '.js');
    try {
      move('mode/' + mode + '/' + mode + '.css', 'mode/' + mode + '.css');
    } catch (ex) {
      //most don't actually have css
    }
  });
  move('mode/rpm/spec/spec.js', 'mode/rpm/spec.js');
  move('mode/rpm/spec/spec.css', 'mode/rpm/spec.css');
  move('mode/rpm/changes/changes.js', 'mode/rpm/changes.js');

  readdir('keymap').forEach(function (keymap) {
    move('keymap/' + keymap, 'keymap/' + keymap);
  });

  move('addon/dialog/dialog.js', 'addon/dialog.js');
  move('addon/dialog/dialog.css', 'addon/dialog.css');
  readdir('addon').forEach(function (addon) {
    if (addon === 'dialog') return;
    readdir('addon/' + addon).forEach(function (file) {
      move('addon/' + addon + '/' + file, 'addon/' + addon + '/' + file);
    });
  });

  empty();
  fixup();

  var modes = {};

  var aliases = {};

  walk(function (path, src) {
    falafel(src, function (node) {
      if (CMMethod(node) === 'defineMode') {
        if (node.arguments[0].type === 'Literal' && typeof node.arguments[0].value === 'string') {
          modes[node.arguments[0].value] = modes[node.arguments[0].value] || [];
          modes[node.arguments[0].value].push(path);
        }
      }
      if (CMMethod(node) === 'defineMIME') {
        if (node.arguments[0].type === 'Literal' && typeof node.arguments[0].value === 'string' &&
            node.arguments[1].type === 'Literal' && typeof node.arguments[1].value === 'string' ) {
          aliases[node.arguments[0].value] = aliases[node.arguments[0].value] || [];
          aliases[node.arguments[0].value].push(node.arguments[1].value);
        } else if (node.arguments[0].type === 'Literal' && typeof node.arguments[0].value === 'string') {
          modes[node.arguments[0].value] = modes[node.arguments[0].value] || [];
          modes[node.arguments[0].value].push(path);
        }
      }
    })
  });
  walk(function (path, src, update) {
    var deps = [];
    function parseArg(arg) {
      if (arg.type === 'Literal' && typeof arg.value === 'string') {
        return [arg.value];
      } else if (arg.type === 'ObjectExpression') {
        for (var i = 0; i < arg.properties.length; i++) {
          if (arg.properties[i].key.type === 'Identifier' && arg.properties[i].key.name === 'name' &&
              arg.properties[i].value.type === 'Literal' && typeof arg.properties[i].value.value === 'string') {
            return [arg.properties[i].value.value];
          }
        }
      } else if (arg.type === 'ConditionalExpression') {
        return flatten([parseArg(arg.consequent), parseArg(arg.alternate)]);
      } else if (arg.type === 'LogicalExpression') {
        return flatten([parseArg(arg.left), parseArg(arg.right)]);
      } else {
        //sometimes we can't work it out
        //console.dir(arg);
        return [];
      }
    }
    function flatten(arr) {
      var buf = [];
      for (var i = 0; i < arr.length; i++) {
        if (Array.isArray(arr[i])) {
          var inner = flatten(arr[i]);
          for (var i = 0; i < inner.length; i++) {
            buf.push(inner[i]);
          };
        } else {
          buf.push(arr[i]);
        }
      }
      return buf;
    }
    falafel(src, function (node) {
      if (CMMethod(node) === 'getMode') {
        var modestrs = parseArg(node.arguments[1]) || [];
        for (var i = 0; i < modestrs.length; i++) {
          if (modestrs[i]) {
            var alases = aliases[modestrs[i]] || [];
            alases = alases.concat([modestrs[i]]);
            var mods = [];
            for (var i = 0; i < alases.length; i++) {
              mods = mods.concat(modes[alases[i]] || []);
            }
            mods = flatten(mods);
            for (var i = 0; i < mods.length; i++) {
              if (mods[i] != path && mods[i] != join(__dirname, 'codemirror.js') && !(/css/.test(path) && /less/.test(mods[i]))) {
                deps.push('./'+ relative(dirname(path), mods[i]).replace(/\\/g, '/'));
              }
            }
          }
        }
      }
    });
    deps = deps.filter(unique());
    src = deps.map(function (name) { return 'require(' + JSON.stringify(name) + ');'; }).join('') + src;
    update(src);
  });

  var diff = read('./addon/merge/dep/diff_match_patch.js')

  console.dir(modes);
});

function CMMethod(node) {
  return (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.computed === false
         && node.callee.object.type === 'Identifier' && node.callee.object.name === 'CodeMirror'
         && node.callee.property.type === 'Identifier') ? node.callee.property.name : false;
}

function unique() {
  var seen = {};
  return function (str) {
    if (seen['key:' + str]) return false;
    else return seen['key:' + str] = true;
  }
}

function empty(path) {
  path = path || join(__dirname, 'src');
  if (fs.statSync(path).isDirectory()) {
    var isempty = true;
    fs.readdirSync(path)
      .forEach(function (file) {
        isempty = empty(join(path, file)) && isempty;
      });
    if (isempty) rimraf(path);
    return isempty;
  } else {
    if (/\.js$/.test(path) || /\.css$/.test(path)) {
      return /test/.test(path) || /docs\.css/.test(path) || /meta\.js/.test(path);
    } else {
      return true;
    }
  }
}

function walk(path, fn) {
  if (typeof path === 'function') {
    fn = path;
    path = __dirname;
  }
  if (fs.statSync(path).isDirectory()) {
    fs.readdirSync(path)
      .forEach(function (file) {
        walk(join(path, file), fn);
      });
  } else {
    if (/\.js$/.test(path)) {
      if (path === __filename) return;
      if (/node_modules/.test(path)) return;
      var src = fs.readFileSync(path).toString().replace(/\r/g, '');
      fn(path, src, function (src) {
        fs.writeFileSync(path, src);
      });
    }
  }
}
function fixup() {
  walk(function (path, src, update) {
    if (path === join(__dirname, 'codemirror.js')) {
      update(src.replace(/window\.CodeMirror/g, 'module.exports'));
    } else {
      update('var CodeMirror = module.exports = require("code-mirror");\n' + 
        src.replace(/window\.CodeMirror/g, 'CodeMirror'));
    }
  })
}

//rpm