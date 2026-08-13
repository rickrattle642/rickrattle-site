// /api/universidade/admin.js
//
// Dispatcher único, por ?action=... — mesmo padrão do Barraca da Feira.
// Todas as ações passam por aqui, incluindo as chamadas do Streamer.bot
// (que só sabe fazer GET simples, sem headers custom — por isso a
// autenticação é feita por query param &key=, não por header).
//
// Ações:
//   ?action=proxima_pergunta&key=XXX
//   ?action=submeter_resposta&key=XXX&user=NOME&message=TEXTO
//   ?action=fechar_ronda&key=XXX
//   ?action=dar_pontos&key=XXX&user=NOME&pontos=10   (botão manual de emergência)
//
// Variáveis de ambiente necessárias no Vercel:
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
//   UNIVERSIDADE_ADMIN_KEY   (a "senha" simples usada no &key=)

import { Redis } from '@upstash/redis';
import { questionsData } from './questions-data.js';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const PREFIX = 'universidade:';
const DURACAO_RONDA_MS = 30_000;
const PONTOS_POR_ACERTO = 10;

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function normalizarResposta(msg) {
  // aceita "A", "a)", "A)", "a resposta é a", etc — só nos interessa a 1ª letra A-D que apareça
  const m = (msg || '').trim().toUpperCase().match(/[ABCD]/);
  return m ? m[0] : null;
}

export default async function handler(req, res) {
  const { action, key, user, message, pontos } = req.query;

  if (key !== process.env.UNIVERSIDADE_ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: 'chave inválida' });
  }

  try {
    switch (action) {

      // -----------------------------------------------------------
      // Carrega/substitui o baralho de perguntas — corre 1 vez agora,
      // e outra vez quando a auditoria terminar (é seguro repetir:
      // substitui tudo e reinicia a lista de "usadas").
      case 'carregar_perguntas': {
        await redis.set(`${PREFIX}questions`, questionsData);
        await redis.del(`${PREFIX}questions:used`);
        return res.status(200).json({
          ok: true,
          carregadas: questionsData.length,
          disciplinas: [...new Set(questionsData.map(q => q.disciplina))],
        });
      }

      // -----------------------------------------------------------
      case 'proxima_pergunta': {
        const questionsRaw = await redis.get(`${PREFIX}questions`);
        const questions = questionsRaw || [];
        if (!questions.length) {
          return res.status(500).json({ ok: false, error: 'sem perguntas carregadas no Redis' });
        }

        const usedIds = await redis.smembers(`${PREFIX}questions:used`);
        const usedSet = new Set(usedIds);
        let disponiveis = questions.filter(q => !usedSet.has(q.id));

        // se já usámos todas, recomeça o ciclo (evita ficar sem perguntas a meio da sessão)
        if (disponiveis.length === 0) {
          await redis.del(`${PREFIX}questions:used`);
          disponiveis = questions;
        }

        const escolhida = disponiveis[Math.floor(Math.random() * disponiveis.length)];
        await redis.sadd(`${PREFIX}questions:used`, escolhida.id);

        const roundId = Date.now();
        const endsAt = roundId + DURACAO_RONDA_MS;

        await redis.set(`${PREFIX}round:current`, {
          roundId,
          endsAt,
          accepting: true,
          ...escolhida,
        });

        // devolve tudo já "achatado" — o Streamer.bot, com "Parse result as JSON",
        // transforma cada campo num argumento automaticamente
        return res.status(200).json({
          ok: true,
          roundId,
          pergunta: escolhida.pergunta,
          opcaoA: escolhida.opcaoA,
          opcaoB: escolhida.opcaoB,
          opcaoC: escolhida.opcaoC,
          opcaoD: escolhida.opcaoD,
          respostaCorreta: escolhida.respostaCorreta,
          curiosidade: escolhida.curiosidade,
          segundos: DURACAO_RONDA_MS / 1000,
        });
      }

      // -----------------------------------------------------------
      case 'submeter_resposta': {
        if (!user || !message) {
          return res.status(400).json({ ok: false, error: 'faltam user/message' });
        }
        const round = await redis.get(`${PREFIX}round:current`);
        if (!round || !round.accepting || Date.now() > round.endsAt) {
          // ronda fechada ou inexistente — ignora em silêncio (isto acontece a maior
          // parte do tempo, sempre que alguém escreve no chat sem ser resposta)
          return res.status(200).json({ ok: true, registada: false });
        }
        const letra = normalizarResposta(message);
        if (!letra) {
          return res.status(200).json({ ok: true, registada: false });
        }
        // HSETNX: só regista a 1ª resposta desta pessoa nesta ronda
        const gravou = await redis.hsetnx(`${PREFIX}round:${round.roundId}:answers`, user, letra);
        return res.status(200).json({ ok: true, registada: !!gravou });
      }

      // -----------------------------------------------------------
      case 'fechar_ronda': {
        const round = await redis.get(`${PREFIX}round:current`);
        if (!round) {
          return res.status(404).json({ ok: false, error: 'sem ronda ativa' });
        }

        await redis.set(`${PREFIX}round:current`, { ...round, accepting: false });

        const respostas = await redis.hgetall(`${PREFIX}round:${round.roundId}:answers`) || {};
        const letraCorreta = round.respostaCorreta.charAt(0); // "A) Polvo" -> "A"

        const leaderboardKey = `${PREFIX}month:${mesAtual()}:leaderboard`;
        const acertaram = [];
        for (const [nome, letra] of Object.entries(respostas)) {
          if (letra === letraCorreta) {
            await redis.zincrby(leaderboardKey, PONTOS_POR_ACERTO, nome);
            acertaram.push(nome);
          }
        }

        const top10raw = await redis.zrange(leaderboardKey, 0, 9, { rev: true, withScores: true });
        // zrange com withScores devolve [nome1, pontos1, nome2, pontos2, ...]
        const top10 = [];
        for (let i = 0; i < top10raw.length; i += 2) {
          top10.push({ nome: top10raw[i], pontos: Number(top10raw[i + 1]) });
        }

        return res.status(200).json({
          ok: true,
          totalRespostas: Object.keys(respostas).length,
          acertaram: acertaram.length,
          top10,
          top10Json: JSON.stringify(top10), // versão em texto simples, mais fácil de usar como argumento no Streamer.bot
        });
      }

      // -----------------------------------------------------------
      case 'dar_pontos': {
        if (!user || !pontos) {
          return res.status(400).json({ ok: false, error: 'faltam user/pontos' });
        }
        const leaderboardKey = `${PREFIX}month:${mesAtual()}:leaderboard`;
        const novoTotal = await redis.zincrby(leaderboardKey, Number(pontos), user);
        return res.status(200).json({ ok: true, user, novoTotal: Number(novoTotal) });
      }

      // -----------------------------------------------------------
      default:
        return res.status(400).json({ ok: false, error: `ação desconhecida: ${action}` });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
