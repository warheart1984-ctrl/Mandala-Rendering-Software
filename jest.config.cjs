module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/mrs/packages/renderer-core/src/fmce"],
  moduleFileExtensions: ["js", "ts"],
  transform: {
    "^.+\\.js$": "babel-jest",
    "^.+\\.ts$": "babel-jest",
  },
  verbose: true,
  testTimeout: 30000,
  maxWorkers: "50%",
};
