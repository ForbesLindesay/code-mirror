"use strict";
var themes = [];
var all = ["3024-day","3024-night","ambiance-mobile","ambiance","base16-dark","base16-light","blackboard","cobalt","eclipse","elegant","erlang-dark","lesser-dark","mbo","mdn-like","midnight","monokai","neat","night","paraiso-dark","paraiso-light","pastel-on-dark","rubyblue","solarized","the-matrix","tomorrow-night-eighties","twilight","vibrant-ink","xq-dark","xq-light"];
exports.available = function (name) {
  return name ? themes.indexOf(name) != -1 : themes;
};
exports.all = function () {
  return all;
};
exports.register = function (name) {
  themes.push(name);
  return name
};