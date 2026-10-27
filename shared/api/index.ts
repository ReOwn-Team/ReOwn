import type { components, operations, paths } from "./schema";

export type { components, operations, paths } from "./schema";
export type AuthResponse = components["schemas"]["AuthResponse"];
export type UserProfile = components["schemas"]["UserProfile"];
export type RegisterUserRequest = components["schemas"]["RegisterUserRequest"];
export type LoginUserRequest = components["schemas"]["LoginUserRequest"];
export type UpdateUserRequest = components["schemas"]["UpdateUserRequest"];
export type ApiOperations = operations;
export type ApiPaths = paths;
