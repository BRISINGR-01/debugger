const path = require("path");

module.exports = {
  mode: "development",
  entry: "./main.js",
  target: "async-node",
  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "dist"),
    clean: true,
  },

  resolve: {
    extensions: [".ts", ".js"],
  },

  module: {
    rules: [
      {
        test: /\.[jt]s$/,
        exclude: [/node_modules/, /recorder-runtime.js/],
        use: {
          loader: "babel-loader",
        },
      },
    ],
  },

  devtool: "source-map",
};
