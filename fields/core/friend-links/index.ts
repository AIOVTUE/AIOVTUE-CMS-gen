import { z } from "zod";

const linkItemSchema = z
  .object({
    url: z.string().optional().nullable(),
    avatar: z.string().optional().nullable(),
    name: z.string().optional().nullable(),
    blog: z.string().optional().nullable(),
    desc: z.string().optional().nullable(),
    color: z.string().optional().nullable(),
    siteshot: z.string().optional().nullable(),
    rss: z.string().optional().nullable(),
    pinLast: z.boolean().optional().nullable(),
  })
  .passthrough();

const linkGroupSchema = z
  .object({
    name: z.string().optional().nullable(),
    desc: z.string().optional().nullable(),
    type: z.string().optional().nullable(),
    shuffle: z.boolean().optional().nullable(),
    links: z.array(linkItemSchema).optional().nullable(),
  })
  .passthrough();

const schema = () => z.array(linkGroupSchema);

const defaultValue: never[] = [];

export { schema, defaultValue };
