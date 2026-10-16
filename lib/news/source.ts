import {z} from 'zod';
export const newsItem=z.object({id:z.uuid(),title:z.string(),body:z.string(),publishedAt:z.string().nullable(),withdrawnAt:z.string().nullable(),createdAt:z.string(),read:z.boolean()});
export const newsState=z.object({items:z.array(newsItem),canManage:z.boolean()});
export type NewsState=z.infer<typeof newsState>;
export type NewsItem=z.infer<typeof newsItem>;
