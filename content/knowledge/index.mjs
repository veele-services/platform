import { commonArticles } from './common.mjs';
import { platformArticles } from './platform.mjs';
import { backofficeArticles } from './backoffice.mjs';
import { staffArticles } from './staff.mjs';
import { customerArticles } from './customer.mjs';
export const knowledgeArticles = [...commonArticles,...platformArticles,...backofficeArticles,...staffArticles,...customerArticles];
