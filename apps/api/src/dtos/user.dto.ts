import { z } from "zod";

const emailSchema = z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((email) => email.toLowerCase());
const phoneSchema = z
    .string()
    .trim()
    .regex(
        /^\+[1-9]\d{7,14}$/,
        "Use international phone format, for example +84901234567",
    );
const passwordSchema = z.string().min(12).max(128);
const loginPasswordSchema = z.string().min(1).max(128);

export const registerUserSchema = z
    .object({
        displayName: z.string().trim().min(1).max(100),
        email: emailSchema,
        phone: phoneSchema,
        password: passwordSchema,
    })
    .strict();

// Keep existing email clients compatible while normalizing all login inputs to one identifier.
export const loginUserSchema = z.union([
    z
        .object({
            identifier: z.union([emailSchema, phoneSchema]),
            password: loginPasswordSchema,
        })
        .strict(),
    z
        .object({ email: emailSchema, password: loginPasswordSchema })
        .strict()
        .transform(({ email, password }) => ({ identifier: email, password })),
    z
        .object({ phone: phoneSchema, password: loginPasswordSchema })
        .strict()
        .transform(({ phone, password }) => ({ identifier: phone, password })),
]);

export const updateUserSchema = z
    .object({
        displayName: z.string().trim().min(1).max(100),
    })
    .strict();

export type RegisterUserDto = z.infer<typeof registerUserSchema>;
export type LoginUserDto = z.infer<typeof loginUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
