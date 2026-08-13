// /api/universidade/state.js
//
// GET público — sem chave, só leitura. Serve para testares por link
// direto no browser, e mais tarde para qualquer página pública que
// queiras mostrar o leaderboard sem expor a chave de admin.

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const PREFIX = 'universidade:';

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default async function handler(req, res) {
  try {
    const round = await redis.get(`${PREFIX}round:current`);
    const leaderboardKey = `${PREFIX}month:${mesAtual()}:leaderboard`;
    const top10raw = await redis.zrange(leaderboardKey, 0, 9, { rev: true, withScores: true });

    const top10 = [];
    for (let i = 0; i < top10raw.length; i += 2) {
      top10.push({ nome: top10raw[i], pontos: Number(top10raw[i + 1]) });
    }

    const totalPerguntas = (await redis.get(`${PREFIX}questions`) || []).length;
    const usadas = (await redis.smembers(`${PREFIX}questions:used`)).length;

    return res.status(200).json({
      ok: true,
      ronda: round
        ? {
            pergunta: round.pergunta,
            accepting: round.accepting,
            endsAt: round.endsAt,
            segundosRestantes: Math.max(0, Math.round((round.endsAt - Date.now()) / 1000)),
          }
        : null,
      top10,
      perguntas: { total: totalPerguntas, usadas },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
