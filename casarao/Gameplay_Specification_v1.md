# RickVerse — Gameplay Specification v1.0

Este documento responde a uma pergunta: **como funciona um turno?**

Nível: **Engine** (motor). Genérico, agnóstico de tema.
Não é o Manifesto (filosofia) nem o Blueprint (dados de um playset específico, ex: Casarão Assombrado).
Qualquer playset futuro (Nave Espacial, Ilha Pirata, Universidade do Rick, Faroeste) corre sobre este mesmo documento sem alterações.

---

## 1. Fluxo de um Turno

Este fluxo descreve o **Modo Live** (Twitch, votação coletiva). O Modo Solo (website) usa a mesma estrutura sem os passos de votação — ver secção 3.

```
STREAM
  ↓
Overlay aparece
  ↓
Descrição (narrativa da sala)
  ↓
2 opções apresentadas
  ↓
60 segundos de votação
  ↓
Chat vota (keywords)
  ↓
Streamer.bot calcula o resultado
  ↓
Executa a consequência
  ↓
Overlay mostra o resultado JUNTO com as opções de navegação (sem clique intermédio "Continuar")
  ↓
Atualiza corações
  ↓
Atualiza inventário
  ↓
Atualiza pistas ambientais
  ↓
Overlay esconde-se
  ↓
Continua a stream
```

**Nota de eficiência (v1.3):** a versão anterior tinha um ecrã dedicado só para mostrar a consequência, com um clique "Continuar" antes de poder navegar — um clique que nunca era uma escolha real. A consequência (mesmo quando é "nada acontece") aparece agora já dentro do mesmo ecrã que apresenta para onde ir a seguir.

---

## 2. Máquina de Estados

```
IDLE → INTRO → ROOM → VOTING → RESOLUTION → UPDATE → IDLE
```

| Estado | O que acontece |
|---|---|
| `IDLE` | Overlay/UI compacto. No Live, a stream principal é o foco. |
| `INTRO` | Expande. Mostra sala atual (nome, imagem, narrativa). |
| `ROOM` | Apresenta as 2 opções. |
| `VOTING` | **Parametrizado por modo** — ver secção 3. Live: conta keywords, 60s. Solo: aguarda o clique do jogador, sem timer. |
| `RESOLUTION` | Opção vencedora é fixada (por votação ou por clique direto). |
| `UPDATE` | Aplica consequência: corações, item, pista ambiental, ou nada. Sala marcada como explorada, se aplicável. |
| `IDLE` | Recolhe. Aguarda o próximo trigger. |

Nem mais um estado. Nem menos um — os dois modos partilham a mesma máquina, só o comportamento interno de `VOTING` muda.

---

## 3. Modos de Jogo: Live vs Solo

O motor corre em dois modos. A máquina de estados (secção 2) é idêntica nos dois — só o estado `VOTING` se comporta de forma diferente.

| | **Live** (Twitch) | **Solo** (website) |
|---|---|---|
| Quem decide | O chat, coletivamente | O jogador, diretamente |
| Input em `VOTING` | Keywords contadas no chat | Clique direto na opção |
| Opções por ecrã | Até 3, igual ao Solo (ver 3.1) | Até 3 |
| Temporizador | 1 minuto, só durante a janela aberta por Redeem (ver 3.2) | Nenhum |
| Regra de vitória | Maioria simples | N/A — só há um voto |
| Desempate | Vence a opção que recebeu o **primeiro voto** (cronologicamente), não a que atingiu primeiro o número final — a regra generaliza-se a 3 opções sem alteração | N/A |
| Vida (corações) | Coletiva — todo o chat partilha a mesma vida | Pessoal — cada jogador tem a sua |
| UI | Overlay que aparece só durante o ciclo ativo (ver 3.2), invisível fora dele | Interface própria de página, sempre visível |

**Regra de motor:** nenhum sistema de conteúdo (Relíquias, NPCs, consumíveis, lifecycle de sala) depende do modo. O Blueprint é o mesmo nos dois — só a camada de input/apresentação/temporização muda.

---

## 3.1 Navegação — Live usa a mesma estrutura do Solo (correção de rumo)

**Esta secção substitui uma decisão anterior.** A versão original desta spec definia que o Live teria de ser estritamente binário (2 opções por prompt, sempre), com o argumento de que um voto por keywords só gera discussão fraturante ("vamos por aqui" vs "vamos por ali") a 2 vias — a 3+, o voto dilui-se e a fratura desaparece.

**Decisão confirmada com o Rick: o Live não vai ser binário.** Vai usar exatamente a mesma estrutura que o motor Solo já usa — até 3 opções por ecrã (`grupos_solo`, paginação, tudo). Razões:
- Normalmente há mais de 2 pessoas a jogar em simultâneo — o chat discute por dentro de cada opção da mesma forma que discutiria entre 2, a fratura não depende de serem só 2 caminhos.
- O jogo já não estagna: mesmo com 3 opções, basta 1 voto para decidir (não há mínimo de participação exigido).
- Ter só um motor de navegação a manter, em vez de dois (um binário para Live, outro livre para Solo), reduz para metade a superfície de coisas que podem divergir ou partir-se.

**Consequência prática:** o campo `navegacao_arvore` no Blueprint, mantido até agora especificamente para o Live, **fica sem função** — nenhum dos dois modos o lê. Continua no Blueprint por agora (não foi removido), mas é uma limpeza pendente sempre que for conveniente.

O sistema de `grupos_solo` (secção "Progressão por grupo em hubs", mais abaixo) serve os dois modos sem alteração nenhuma.

---

## 3.2 Ciclo de ativação em Live — Redeem, não temporizador automático

**O Casarão não corre em contínuo durante a stream — é acionado por Redeem de Channel Points, manualmente controlado pelo Rick via StreamDeck.** Isto é deliberado: um ciclo automático (ex: de 10 em 10 minutos, sempre) corre o risco de disparar sem ninguém interessado a votar, o que é anticlimático. O Redeem funciona como filtro social — só avança quando alguém se importa o suficiente para gastar pontos nisso.

**Formato: ecrã inteiro, não overlay lateral.** Decisão confirmada — um cantinho lateral desperdiçava o trabalho visual já feito no `index_web.html` (texturas, manchas, livro a abrir a página inteira) e diluía a sensação de "paramos tudo para isto". O motor Live reutiliza o `index_web.html` tal como está — não é preciso construir um formato novo, só a ponte de comunicação com o Streamer.bot (ver 3.3, "por construir" no checklist do projeto).

**Sequência de um ciclo completo:**

1. **Redeem** — alguém no chat resgata a recompensa. Isto arranca imediatamente um **cooldown mínimo de 10 minutos** na própria recompensa (impede reativação imediata, dá espaço entre ciclos). O Streamer.bot desativa a recompensa enquanto o ciclo estiver ativo (passos 2-6), reativando-a só no fim — evita um 2º Redeem a meio de uma votação já em curso.
2. **Overlay aparece** (ecrã inteiro) — controlado pelo Rick, não automático. O Rick decide o momento exato (pode terminar uma frase, resolver outra coisa no chat primeiro).
3. **Conta-se a história** — o estado atual da aventura (sala, narrativa, o que está em jogo).
4. **Votação** — o Rick aciona o temporizador (botão próprio no StreamDeck). **Só a partir deste momento é que o voto fica "ativo"** — o chat pode escrever keywords a qualquer altura da stream, mas só contam durante esta janela de **1 minuto**. O Streamer.bot precisa de um estado explícito (`voto_ativo: sim/não`), nunca contar por defeito. Ao fim do minuto, `voto_ativo` desliga-se sozinho.
5. **Percentagens** — assim que o voto fecha, o overlay mostra de imediato o resultado de cada opção (ex: "A — 62% · B — 38%"), sem esconder o ecrã. Fica visível **10 segundos, automático** (sem precisar de um botão do Rick).
6. **Transição automática** — ao fim desses 10 segundos, avança sozinho para a consequência da escolha vencedora (desempate: vence a opção do **primeiro voto**, cronologicamente, ver secção 3).
7. **Overlay fecha** (fade) — o jogo continua no stream, mas o **resultado seguinte só é revelado no próximo Redeem** (mínimo 10 minutos depois). É esta espera deliberada que gera suspense serializado — quem votou não sabe o que vem a seguir até o overlay voltar.

**Mecânicas de jogo específicas para este ritmo** (ex: o que acontece se o Redeem calhar num momento de perigo, se a votação for interrompida, etc.) ainda não foram desenhadas — fica para quando a implementação for a sério.

---

## 3.3 Persistência entre streams — evento de Outubro, um mês só

**O Casarão em Live é um evento limitado a outubro, não uma funcionalidade permanente do canal.** Isto importa porque justifica ter arquitetura própria (uma base de dados já existente e reutilizável) só para este mês, sem precisar de resolver "para sempre".

**Regra de persistência, confirmada:**

- **Dentro de uma stream:** já é contínuo por natureza — o ciclo de Redeem nunca reinicia nada a meio.
- **Entre streams, sem morte:** o estado **persiste** — sala atual, vida, relíquias, mochila. A stream seguinte começa exatamente onde a anterior ficou (ex: "ontem ficámos aqui, depois de uma sessão tensa..."), em vez de recomeçar do Hall todas as vezes. Isto evita que a energia inicial do chat (tipicamente mais alta no início/meio de cada stream) se gaste sempre no mesmo início repetido.
- **Morte: reinicia tudo, sem exceção.** Vida, relíquias e mochila voltam a 0 — mesmo relíquias conquistadas em streams anteriores. **Decisão deliberada, não por defeito:** dar peso real a "será que conseguimos escapar este mês?" depende de a morte custar a sério. Se o progresso sobrevivesse à morte, o evento perdia a tensão que o resto do jogo (Templário, "Algo te segue", etc.) foi construído para ter.

**Dados a guardar na base de dados** (campos, não a estrutura da BD em si — isso fica para quando a ligação for feita a sério): sala atual, vida, relíquias, mochila, e os stats globais acumulados ao longo do mês (mortes, fugas, relíquias encontradas ao todo) para uma futura bancada de estatísticas públicas.

---

## 3.4 Contrato técnico — ponte Streamer.bot ↔ Browser (implementado)

Reaproveitada a mesma ponte já usada no Universidade do Rick (`@streamerbot/client`, WebSocket em `127.0.0.1:8080`, evento `General.Custom` com um `switch` por nome). **O browser mantém toda a lógica do jogo** (dano, trocas, mortes) — o Streamer.bot só diz qual letra venceu a votação; o motor trata isso exatamente como um clique humano no botão certo (`escolherPorLetra()` encontra o botão renderizado na posição certa e dispara o `.click()` dele).

**Ficheiro:** `casarao/index.html` (antigo `index_web.html`).

**4 eventos, todos de Streamer.bot → Browser:**

| Evento | Quando dispara | Campos | O que o browser faz |
|---|---|---|---|
| `casarao_mostrar` | Botão StreamDeck: mostrar overlay | — | `render()` do estado atual |
| `casarao_iniciar_voto` | Botão StreamDeck: arrancar cronómetro | `duracao_seg` | Mostra cronómetro visível no canto |
| `casarao_resultado` | Streamer.bot decide o vencedor (fim do minuto) | `vencedora` (`"a"`/`"b"`/`"c"`), `contagem` (`{a:12,b:34,c:8}`) | Mostra percentagem em cada botão (10s), depois `escolherPorLetra(vencedora)` sozinho |
| `casarao_esconder` | Fim do ciclo | — | Nada por agora — o OBS trata de esconder a Browser Source |

A transição automática de 10 segundos (secção 3.2, ponto 6) vive **dentro do browser** (um `setTimeout`), não precisa de um evento próprio do Streamer.bot para a disparar.

**Ranking de interações (quem mais votou) — infraestrutura própria, separada da votação em si:**

- Base: Upstash Redis já partilhado com os outros eventos do canal (Universidade, Barraca da Feira, Hall of Fame)
- Chave: `casarao:interacoes:leaderboard` (HASH: `username → contagem`)
- Endpoint: `api/casarao/admin.js` (Vercel) — nem o browser nem o Streamer.bot falam com o Upstash diretamente, mesmo padrão do Universidade
  - `?action=registar_interacao&user=NOME` — chamado pelo Streamer.bot a cada voto válido
  - `?action=obter_leaderboard` — devolve o ranking ordenado
  - `?action=reset_leaderboard` — limpa tudo, para recomeçar entre eventos se for preciso
- Página de consulta: `casarao/ranking.html` — atualiza-se sozinha a cada 20s (mesmo padrão do Notas.html), não faz parte do overlay público

---

## 4. Lifecycle de uma Sala

```
Entrar
  ↓
Narrativa
  ↓
É a primeira visita a esta sala?
  ↓                                    ↓
 SIM                                   NÃO
  ↓                                    ↓
Escolha obrigatória entre as 2       Ainda há opção por usar?
opções (drama do voto)                 ↓                    ↓
  ↓                                   SIM                   NÃO
Resultado                              ↓                    ↓
  ↓                            Pode escolhê-la OU      Sala "explorada":
Opção marcada como usada       seguir sem a usar        mostra só
  ↓                                    ↓                estado_apos_exploracao
  └──────────────────────────────────┴──────────────────────┘
                                       ↓
                                      Fim
```

Regra final, depois de 2 correções (ver histórico abaixo): **a primeira visita a uma sala é sempre uma escolha obrigatória entre as 2 opções** — é aqui que está o drama do voto, a razão de existir da mecânica. **Em qualquer visita seguinte, se ainda houver uma opção por usar, o jogador pode escolhê-la ou seguir em frente sem a usar — nunca é forçado a repetir um risco só porque voltou a passar por ali.**

<details>
<summary>Histórico da correção (porque interessa a quem for desenhar salas novas)</summary>

- **v1.0:** sala fechava por completo após a primeira escolha, qualquer que fosse. Problema: numa sala com uma opção "dá a Relíquia" e outra "só flavor", escolher a errada primeiro bloqueava essa Relíquia para o resto da run, sem aviso — impasse silencioso, pior do que morrer.
- **v1.1:** cada opção passou a resolver-se uma vez, a sala só fecha quando ambas foram usadas. Resolvia o impasse, mas criava um novo problema: se restasse só a opção letal, o jogador era *forçado* a escolhê-la numa revisita, mesmo sabendo o resultado.
- **v1.2 (atual):** obrigatório só na primeira visita. Depois disso, qualquer opção restante é sempre opcional.

</details>

**Correção de UX (v1.5, revista em v1.6): opção restante nunca fica escondida atrás de "saír e reentrar" — mas nunca ao custo de mais de 2 botões.** A v1.5 juntou a opção restante e a navegação na mesma tela, mas isso podia gerar 3 ou mais botões em simultâneo (ex: 1 ação restante + 2 destinos de navegação), quebrando a regra de voto sempre binário — inaceitável em Live, onde o chat escreve literalmente "A" ou "B" e uma 3ª opção invisível cria confusão.

Regra final (v1.6): se restarem 2+ opções por usar, mostra essas 2 (sem navegação). Se restar exatamente 1, mostra-a junto de "Seguir sem fazer nada" — sempre 2 botões. Só depois de resolvida ou recusada é que a navegação aparece, sozinha, na tela seguinte. Nunca ação e navegação no mesmo ecrã.

**Correção de pacing (v1.7): a opção singular que resta não é oferecida de novo na mesma visita.** Depois de agires uma vez numa sala nesta visita, se restar só 1 opção, o motor vai direto para a navegação em vez de perguntar "opção restante + seguir sem fazer nada" imediatamente — isso eram 2 cliques de baixo valor de seguida (ex: Hall). A opção que falta continua garantida: reaparece normalmente na próxima vez que entrares nessa sala. Excepção: salas com `perigo_acumulado` continuam a mostrar tudo na mesma visita, porque a escalada de risco (ex: Quarto de Hóspedes) só funciona se for contínua.

**Rotulagem sempre A/B, nunca letra+seta misturadas.** Os botões de ação (escolhas com consequência) usam sempre letras sequenciais (A, ou A/B) atribuídas pela posição em que aparecem — nunca a letra original do Blueprint, para que restar só 1 opção nunca mostre "B" solto. Botões de navegação pura (para onde ir) usam sempre seta "→", exceto quando são eles próprios uma escolha real com 2 lados (ex: "Voltar" vs "Explorar mais" num hub) — esses também ficam A/B.

## Objetos não essencial

A mochila guarda até 5 objetos não essenciais em simultâneo (antes era 1 — um jogador que já tivesse a maçã não conseguia pegar no terço partido a seguir, o que não fazia sentido). As Relíquias Essenciais (sempre 3, nunca mais) vivem num espaço separado, nunca partilham a mochila com objetos não essenciais.

NPCs que "trocam" (Cavaleiro, Viking, Gentleman) continuam a exigir 1 objeto não essencial como pagamento — a mochila maior não os torna gratuitos, só deixa de forçar o jogador a escolher entre dois achados que não competem entre si.

## Navegação nunca esconde o "voltar"

Para salas com exactamente 2 ligações reais (uma "para a frente", outra "para trás"), o motor mostra **sempre as duas**, mesmo que voltar não tenha recompensa nenhuma. Podar o "voltar" só porque não há nada de novo lá conduziria o jogador para a frente sem ele reparar que estava a escolher — e isso é particularmente sensível quando "a frente" é uma Relíquia. O jogador deve poder hesitar, mesmo perto do prémio. Isto custa 1 clique extra às vezes; é um custo aceite.

Esta regra aplica-se só a salas de ligação simples (sem árvore) — hubs com árvore binária (Hall, Corredor Principal, Observatório) já resolvem isto à sua maneira, com o botão fixo "Voltar" antes de entrar na árvore.

## Padrão: pesquisa 1 a 1, com custo progressivo

Alternativa ao "perigo acumulado" para salas onde a curiosidade deve custar gradualmente, não só ao fim de um limite fixo. Uma sala com `um_a_um: true` mostra sempre exactamente 1 ação por vez (nunca 2 juntas, mesmo que restem mais), sempre acompanhada de "Sair" — o jogador decide, a cada pesquisa, se quer continuar. Combinado com `custo_progressivo: { a_partir_de, efeito_vida, mensagem }`: a partir da N-ésima ação nessa sala (independente de qual), aplica-se sempre o efeito — normalmente a primeira é grátis e todas as seguintes custam.

Uma sala com `estado: "placeholder"` nunca entra neste lifecycle — é ignorada pelo motor até ganhar conteúdo real.

**Padrão: mais de 2 ações possíveis numa sala (v1.4).** Uma sala pode definir mais de 2 `opcoes` no Blueprint (ex: 3 objetos concretos para explorar) — o motor nunca mostra mais de 2 de uma vez; revela as restantes em visitas seguintes, pela mesma ordem definida no Blueprint. Isto evita frases abstratas tipo "explorar um ou vários itens" — cada ação é concreta e nomeada (ex: "Explorar a gaveta").

**Padrão: perigo acumulado.** Uma sala pode ter um campo `perigo_acumulado: { limite, mensagem_morte }` (morte direta) ou `perigo_acumulado: { limite, efeito_vida, mensagem }` (dano — ex: `-1`). Cada ação usada nessa sala conta para o limite, seja qual for a opção escolhida; ao atingir o limite, a ação atual dispara o efeito em vez de produzir o seu resultado normal. Isto modela risco por curiosidade repetida (ex: fumo que se acumula) sem depender de sorte — é sempre evitável parando antes do limite, nunca aleatório. Morte instantânea só se justifica em situações extremamente óbvias (ver Manifesto); a maioria dos casos deve preferir dano a morte, para não ser anticlimática.

**Frases dos NPCs.** O motor mostra `primeira_frase` na primeira interação com o NPC nessa visita (antes de qualquer escolha) e `frase_final` depois de resolvida a ação, como diálogo — nunca expõe literalmente campos como `protege` (isso é dado de bastidores para quem escreve conteúdo, não para o jogador ver). Tensão constrói-se através do que o NPC diz e do texto da consequência, nunca através de rótulos como "tensão, sem dano" — isso quebra a imersão em vez de a criar.

**Imagem principal dinâmica (v1.8).** Uma sala com NPC mostra o retrato dele ao entrar (o momento de "conhecer a personagem") e sempre que a última ação escolhida tiver `"foco": "npc"` no Blueprint — ações diretamente sobre o NPC (confronto, diálogo, troca). Todas as outras ações (sobre o ambiente da sala) mostram a imagem da própria sala. Isto substitui uma tentativa anterior de mostrar os dois em simultâneo (retrato pequeno ao lado do nome) — ilegível em ecrãs pequenos/telemóvel. `foco` é opcional por opção; omitido = mostra a sala.

**Progressão por grupo em hubs (v1.9, atualizado 3.1).** A lista plana de destinos (v0.25) resolveu o problema de perguntas aninhadas, mas perdeu o sentido de estrutura — Hall a mostrar 5 salas soltas, sem nenhuma parecer relacionada com as outras. Hubs com muitas saídas podem ter um campo `grupos_solo` — usado pelos **dois modos**, Live e Solo (ver 3.1) — uma lista de zonas, cada uma com `texto` + ou `destino` (zona = 1 sala só) ou `salas` (lista de salas dentro dessa zona). O jogador (ou o chat) escolhe a zona primeiro; só depois vê as salas específicas dela. Dá sentido de progressão sem reintroduzir perguntas binárias aninhadas.

---

## 5. Lifecycle de Item — 3 tipos distintos

O motor v1.0 assumia um único tipo de item, sempre opcional. A partir da Atualização de Regras (Relíquias Essenciais), existem 3 tipos com lifecycles diferentes.

### 4.1 Relíquia Essencial

```
Relíquia existe (1 por andar, definida no Blueprint)
  ↓
Jogador encontra (consequência de uma opção específica, não revelada)
  ↓
Fica permanentemente na posse do grupo
  ↓
Nunca desaparece, nunca é trocada
  ↓
Quando as 3 estão reunidas → Porta Principal abre
```

Única exceção à regra "nenhum item bloqueia progressão": as 3 Relíquias são obrigatórias por definição.

### 4.2 Objeto não essencial

```
Item existe (definido no Blueprint)
  ↓
Jogador encontra
  ↓
Vai para o slot único de objeto não essencial (mochila = 1 slot)
  ↓
Se já houver um objeto no slot → troca (o anterior fica disponível na sala) ou ignora
  ↓
Pode ser trocado com um NPC
  ↓
Nunca é obrigatório para progredir
```

### 4.3 Consumível

```
Consumível existe na sala (definido no Blueprint)
  ↓
Jogador encontra — NUNCA vai para o inventário
  ↓
Decisão: usar agora ou deixar na sala
  ↓
Se usado → recupera vida definida → desaparece
  ↓
Se não usado → permanece na sala, disponível numa visita futura
```

---

## 6. Interação com NPC (nota rápida)

NPCs não têm estado próprio na máquina de estados — correm dentro de `ROOM`/`RESOLUTION` como qualquer outra opção. Regra fixa: uma interação com NPC nunca desbloqueia uma cadeia de quests. Produz sempre uma consequência imediata (vida, objeto, informação, ou nada) e fecha ali.

Cada NPC no Blueprint (`npcs_globais`) tem `primeira_frase` (o que diz quando o encontras, antes de qualquer escolha) e `frase_final` (o que diz depois da tua decisão, a fechar o encontro). São o que dá voz própria ao NPC, além do texto de `consequencia` da opção escolhida.

---

## 7. Template Oficial de Sala

Todo playset usa exatamente estes campos. Nenhum a mais, nenhum a menos.

| Campo | Descrição |
|---|---|
| `nome` | Nome da sala |
| `tema` | Uma frase — o que esta sala representa no playset |
| `objeto_principal` | O objeto pelo qual a sala é lembrada |
| `objeto_secundario` | Opcional — 0 ou 1 |
| `narrativa_inicial` | 2-3 linhas, nunca mais |
| `opcao_a` / `consequencia_a` | Texto da opção + o que acontece |
| `opcao_b` / `consequencia_b` | Texto da opção + o que acontece |
| `imagem` | Referência da ilustração |
| `eventos_futuros` | Pistas ambientais ou ecos que esta escolha desbloqueia noutra sala |
| `estado_apos_exploracao` | O que a sala mostra depois de já ter sido visitada nesta run |

Mapeamento direto para o Blueprint JSON: `nome`, `opcoes[].texto`, `opcoes[].consequencia`, `pistas_ambientais`, `itens_possiveis`.

Quando este template está fechado, escrever novas salas — em qualquer playset — deixa de ser trabalho criativo caso a caso e passa a ser preenchimento de molde.

---

## 8. Relação entre os 3 documentos

| Documento | Responde a | Muda por playset? |
|---|---|---|
| **Manifesto** | Porque é que o jogo existe / o que sente | Raramente |
| **Gameplay Specification** (este) | Como funciona um turno / a máquina de estados | Nunca (é o motor) |
| **Blueprint** (JSON) | Que salas, itens e fragmentos existem *neste* playset | Sempre — é o que troca quando o tema muda |
