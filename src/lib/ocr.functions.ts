import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  images: z.array(z.string().min(1)).min(1).max(6),
  existing: z
    .array(
      z.object({
        product: z.string(),
        quantity: z.number(),
        unitPrice: z.number(),
      }),
    )
    .optional(),
});

export const extractQuote = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const { extractQuoteFromImages } = await import("./ocr.server");
    return extractQuoteFromImages(data.images, data.existing);
  });
