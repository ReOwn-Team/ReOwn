module.exports = {
    rootDir: ".",
    setupFiles: ["<rootDir>/tests/setup-env.cjs"],
    testMatch: ["<rootDir>/tests/**/*.spec.ts"],
    transform: {
        "^.+\\.(t|j)s$": [
            "ts-jest",
            {
                tsconfig: "<rootDir>/tsconfig.test.json",
            },
        ],
    },
    testEnvironment: "node",
    moduleFileExtensions: ["js", "json", "ts"],
};
