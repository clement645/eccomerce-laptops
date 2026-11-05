import { Injectable } from '@nestjs/common';
import { Prisma } from '@repo/database';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { searchTokens, type ProductSearchEngine, type SearchMatch } from './product-search.js';

/** Minimum trigram word similarity for typo matches ("thinkpd" → "ThinkPad"). */
const TYPO_THRESHOLD = 0.45;

/**
 * PostgreSQL search: full-text match on products."searchVector" (weighted name, brand, specs,
 * descriptions), prefix matching for partially typed words, and pg_trgm similarity on the name
 * for typos. All user input is passed as bound parameters.
 */
@Injectable()
export class PostgresProductSearch implements ProductSearchEngine {
  constructor(private readonly prisma: PrismaService) {}

  async match(query: string, limit: number): Promise<SearchMatch[]> {
    const tokens = searchTokens(query);
    if (tokens.length === 0) return [];
    const text = tokens.join(' ');
    // "macbook air 13" -> "macbook:* & air:* & 13:*" (tokens contain only letters and digits).
    const prefix = tokens.map((token) => `${token}:*`).join(' & ');

    const rows = await this.prisma.client.$queryRaw<{ id: string; rank: number }[]>(Prisma.sql`
      SELECT p.id,
             ts_rank_cd(p."searchVector", q_prefix) * 2
               + ts_rank_cd(p."searchVector", q_english)
               + word_similarity(${text}, lower(unaccent(p.name))) AS rank
      FROM products p,
           to_tsquery('simple', ${prefix}) q_prefix,
           websearch_to_tsquery('english', unaccent(${text})) q_english
      WHERE p.status = 'PUBLISHED'
        AND p."publishedAt" <= now()
        AND (
          p."searchVector" @@ q_prefix
          OR p."searchVector" @@ q_english
          OR word_similarity(${text}, lower(unaccent(p.name))) >= ${TYPO_THRESHOLD}
        )
      ORDER BY rank DESC, p."salesCount" DESC
      LIMIT ${limit}
    `);
    return rows.map((row) => ({ productId: row.id, rank: Number(row.rank) }));
  }
}
