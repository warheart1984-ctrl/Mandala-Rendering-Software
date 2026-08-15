module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/fmce/tests'],
  moduleFileExtensions: ['js', 'ts'],
  transform: {
    '^.+\\.js$': 'babel-jest',
    '^.+\\.ts$': 'ts-jest'
  },
  verbose: true,
  testTimeout: 30000,
  maxWorkers: '50%',
};