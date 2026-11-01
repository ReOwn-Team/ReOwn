import { z } from "zod";
export const productInputSchema = z
    .object({
        requestId: z.string().uuid().optional(),
        title: z.string().trim().min(4).max(200),
        category: z.enum([
            "Laptop",
            "Điện thoại",
            "Phụ kiện",
            "Sách",
            "Đồ dùng",
            "Sở thích",
        ]),
        description: z.string().trim().min(20).max(10000),
        price: z.number().int().min(1).max(1000000000),
        condition: z.enum(["Như mới", "Dùng tốt", "Cần sửa chữa"]),
        knownDefects: z.string().trim().max(2000),
        location: z.string().trim().min(1).max(200),
        fulfillmentMethods: z
            .array(z.enum(["shipping", "meetup"]))
            .min(1)
            .max(2)
            .refine((v) => new Set(v).size === v.length),
        images: z
            .array(
                z.union([
                    z.object({ id: z.string().uuid() }).strict(),
                    z
                        .object({ upload: z.number().int().min(0).max(5) })
                        .strict(),
                ]),
            )
            .min(1)
            .max(6),
        confirmed: z.literal(true),
    })
    .strict();
export type ProductInput = z.infer<typeof productInputSchema>;
export const productStatusSchema = z
    .object({ status: z.enum(["published", "hidden", "sold"]) })
    .strict();
