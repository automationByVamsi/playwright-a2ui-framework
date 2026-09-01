module.exports = {
  default: {
    paths: ["features/**/*.feature"],
    requireModule: ["tsx/cjs"],
    require: ["features/support/**/*.ts", "features/step-definitions/**/*.ts"],
    format: [
      "progress-bar",
      "html:reports/cucumber.html",
      "json:reports/cucumber.json",
    ],
    formatOptions: { snippetInterface: "async-await" },
    parallel: 0,
  },
};
