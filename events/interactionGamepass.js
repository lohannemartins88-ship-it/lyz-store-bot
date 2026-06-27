const { 
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags 
} = require('discord.js');
const axios = require('axios');

global.dadosPedidos = global.dadosPedidos || new Map();

// 2. RETRY DA API (Apenas erros temporários, recusa estritamente 400, 401, 403, 404, 405, 422)
async function robloxRequestWithRetry(config, retries = 2, delay = 1000) {
    const startTime = Date.now();
    try {
        const response = await axios(config);
        console.log(`[LOG API] Endpoint: ${config.url} | Status: ${response.status} | Tempo: ${Date.now() - startTime}ms`);
        return response;
    } catch (error) {
        const status = error.response ? error.response.status : null;
        console.error(`[LOG API ERRO] Endpoint: ${config.url} | Status: ${status} | Erro: ${error.message}`);
        
        if (status && [400, 401, 403, 404, 405, 422].includes(status)) {
            throw error;
        }
        if (retries > 0) {
            console.log(`[LOG API RETRY] Tentando novamente ${config.url} em ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return robloxRequestWithRetry(config, retries - 1, delay * 1.5);
        }
        throw error;
    }
}

// 5. NORMALIZAÇÃO COMPLETA DA GAMEPASS
function normalizeRobloxGamepass(data) {
    if (!data) return null;
    
    const id = data.id || data.Id || data.assetId || data.AssetId || null;
    const nome = data.name || data.Name || data.title || data.Title || null;
    
    let preco = null;
    if (data.priceInRobux !== undefined) preco = data.priceInRobux;
    else if (data.PriceInRobux !== undefined) preco = data.PriceInRobux;
    else if (data.price !== undefined) preco = data.price;
    else if (data.Price !== undefined) preco = data.Price;

    let creatorId = null;
    let creatorType = null;
    let targetId = null;

    if (data.creator || data.Creator) {
        const c = data.creator || data.Creator;
        creatorId = c.id || c.Id || c.creatorTargetId || c.CreatorTargetId || null;
        creatorType = c.type || c.Type || c.creatorType || c.CreatorType || null;
        targetId = c.targetId || c.TargetId || null;
    }

    const normalized = {
        id: id ? String(id) : null,
        nome: nome ? String(nome) : null,
        preco: preco !== null ? Number(preco) : null,
        creatorId: creatorId ? String(creatorId) : null,
        creatorType: creatorType ? String(creatorType) : null,
        targetId: targetId ? String(targetId) : null,
        universeId: data.universeId || data.UniverseId || null,
        assetId: data.assetId || data.AssetId || (id ? Number(id) : null),
        ownerId: data.ownerId || data.OwnerId || null,
        ownerType: data.ownerType || data.OwnerType || null
    };

    console.log(`[LOG NORMALIZAÇÃO] Objeto gerado:`, normalized);
    return normalized;
}

// 3. PAGINAÇÃO COMPLETA E 4. VALIDAÇÃO DE PROPRIEDADE SEM FALSOS NEGATIVOS
async function verifyGamepassByUserList(targetUserId, inputGamepassId, normalizedGP) {
    console.log(`[VALIDAÇÃO ATIVOS] Iniciando busca exaustiva para o usuário: ${targetUserId}`);
    const gamepassProcurada = String(inputGamepassId);
    const userIdString = String(targetUserId);

    // Evidência Concreta 1: Se os metadados diretos já confirmarem o dono
    if (normalizedGP && normalizedGP.creatorId && normalizedGP.creatorId === userIdString) {
        console.log(`[VALIDAÇÃO ATIVOS] [APROVADO VIA METADADOS] ID do criador bate diretamente com o cliente.`);
        return { success: true, isMatch: true, reason: 'Gamepass validada via ID de criador direto' };
    }

    let nextUniverseCursor = "";
    let encontrouMundos = false;

    try {
        // Percorre TODAS as páginas de Universos/Jogos do Usuário (nextPageCursor)
        do {
            const urlGames = `https://games.roblox.com/v2/users/${targetUserId}/games?accessFilter=Public&limit=50${nextUniverseCursor ? `&cursor=${nextUniverseCursor}` : ''}`;
            const gamesRes = await robloxRequestWithRetry({ method: 'get', url: urlGames, timeout: 5000 }).catch(() => null);

            if (!gamesRes || !gamesRes.data || !Array.isArray(gamesRes.data.data)) {
                break;
            }

            const universos = gamesRes.data.data;
            if (universos.length > 0) encontrouMundos = true;

            for (const universo of universos) {
                const universeId = universo.id;
                if (!universeId) continue;

                let nextGpCursor = "";
                // Percorre TODAS as páginas de Gamepasses do Universo atual
                do {
                    const urlGps = `https://games.roblox.com/v1/games/${universeId}/gamepasses?limit=100${nextGpCursor ? `&cursor=${nextGpCursor}` : ''}`;
                    const gpRes = await robloxRequestWithRetry({ method: 'get', url: urlGps, timeout: 4000 }).catch(() => null);

                    if (!gpRes || !gpRes.data || !Array.isArray(gpRes.data.data)) {
                        break;
                    }

                    const matchFound = gpRes.data.data.some(gp => String(gp.id) === gamepassProcurada);
                    if (matchFound) {
                        console.log(`[VALIDAÇÃO ATIVOS] [APROVADO] Gamepass ${gamepassProcurada} encontrada no Universo ${universeId}.`);
                        return { success: true, isMatch: true, reason: 'Gamepass localizada dentro da lista de mundos públicos do jogador' };
                    }

                    nextGpCursor = gpRes.data.nextPageCursor || "";
                } while (nextGpCursor);
            }

            nextUniverseCursor = gamesRes.data.nextPageCursor || "";
        } while (nextUniverseCursor);

        // Se a API rodou perfeitamente, listou mundos e mesmo assim não encontrou nenhuma relação
        if (encontrouMundos) {
            // Se o criador da GP apontar explicitamente para OUTRA pessoa, temos prova definitiva
            if (normalizedGP && normalizedGP.creatorId && normalizedGP.creatorId !== userIdString) {
                console.error(`[VALIDAÇÃO ATIVOS] [REPROVADO] Dono real é ${normalizedGP.creatorId}, mas o cliente é ${userIdString}.`);
                return { success: false, isMatch: false, reason: 'A Gamepass não pertence à conta do usuário informado' };
            }
            // Se não bateu nas listas públicas mas não temos ID de outro dono definitivo, tratamos como limitação (privacidade/padrão)
            console.log(`[VALIDAÇÃO ATIVOS] [IMPOSSIBILIDADE] Não listado nos mundos públicos. Liberando condicional.`);
            return { success: true, isMatch: false, isLimited: true, reason: 'Não foi possível confirmar de forma pública devido às configurações do perfil' };
        }

        console.log(`[VALIDAÇÃO ATIVOS] [IMPOSSIBILIDADE] Nenhum universo listado. Passando preventivamente.`);
        return { success: true, isMatch: false, isLimited: true, reason: 'Nenhum universo retornado pela API para validação direta' };

    } catch (error) {
        console.error(`[VALIDAÇÃO ATIVOS] Erro crítico na varredura:`, error.message);
        return { success: true, isMatch: false, isLimited: true, reason: 'Não foi possível validar a propriedade devido à limitação da API do Roblox' };
    }
}

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        if (!interaction.guild || !interaction.channel) return;
        
        if (interaction.isButton()) {
            // 11. CONTROLE DE INTERAÇÃO (Garantir tratamento correto para evitar Interaction Failed)
            if (interaction.customId === 'gamepass_prosseguir_painel') {
                if (interaction.replied || interaction.deferred) return;
                await interaction.deferUpdate().catch(err => console.error(err));

                const embedVerificacao = new EmbedBuilder()
                    .setColor('#FFB6C1')
                    .setTitle('<:laco2:1431737122276245705> ┆ VERIFICAÇÃO DA GAMEPASS')
                    .setDescription(
                        `<a:emoji12:1506723881573158912> **Clique no botão abaixo de verificar gamepass, coloque a quantia desejada e o ID da sua Gamepass criada.**\n\n` +
                        `*O sistema irá verificar automaticamente se ela existe, caso tenha errado algo clique em voltar! <:emoji_50:1519875821865668608>*`
                    )
                    .setFooter({ text: '© Lyz Store sua lojinha de robux!' });

                const botoesVerificacao = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('gamepass_abrir_modal_link')
                        .setLabel('Verificar Gamepass')
                        .setEmoji('1429177787700351167')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('gamepass_calculadora')
                        .setLabel('Calculadora')
                        .setEmoji('1495095690135732335')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('deletar_carrinho')
                        .setEmoji('1334263989034815528')
                        .setStyle(ButtonStyle.Danger), 
                    new ButtonBuilder()
                        .setCustomId('gamepass_voltar_painel')
                        .setEmoji('1519875821865668608')
                        .setStyle(ButtonStyle.Secondary) 
                );

                await interaction.editReply({ embeds: [embedVerificacao], components: [botoesVerificacao] }).catch(err => console.error(err));
                return;
            }

            if (interaction.customId === 'gamepass_abrir_modal_link') {
                if (interaction.replied || interaction.deferred) return;
                
                // 1. MODAL EXCLUSIVO (Apenas 2 campos mantidos de forma estrita)
                const modal = new ModalBuilder()
                    .setCustomId('modal_link_gamepass')
                    .setTitle('Dados da Gamepass');

                const quantiaInput = new TextInputBuilder()
                    .setCustomId('modal_quantia_valor')
                    .setLabel('Quantos Robux deseja comprar? (Mín. 100)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder('Ex: 1000');

                const linkInput = new TextInputBuilder()
                    .setCustomId('modal_link_id_valor')
                    .setLabel('Digite o ID da sua Gamepass')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder('213245648974');

                modal.addComponents(
                    new ActionRowBuilder().addComponents(quantiaInput),
                    new ActionRowBuilder().addComponents(linkInput)
                );
                await interaction.showModal(modal).catch(err => console.error(err));
                return;
            }

            if (interaction.customId === 'gamepass_calculadora' || interaction.customId === 'gamepass_calculadora_repetir') {
                if (interaction.replied || interaction.deferred) return;
                const modal = new ModalBuilder()
                    .setCustomId('modal_calculadora_robux')
                    .setTitle('Calculadora de Valores');

                const calcInput = new TextInputBuilder()
                    .setCustomId('calc_input_valor')
                    .setLabel('Digite a quantia para calcular o valor:')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder('Ex: 500');

                modal.addComponents(new ActionRowBuilder().addComponents(calcInput));
                await interaction.showModal(modal).catch(err => console.error(err));
                return;
            }

            if (interaction.customId === 'gamepass_voltar_painel') {
                if (interaction.replied || interaction.deferred) return;
                await interaction.deferUpdate().catch(err => console.error(err));

                const embedGamepass = new EmbedBuilder()
                    .setColor('#FFB6C1')
                    .setTitle('CRIAÇÃO DA GAMEPASS!')
                    .setDescription(
                        `<:emoji_sparkles:1431742884071342253> **Crie a sua gamepass com o valor correto e depois clique em Prosseguir.**\n\n` +
                        `<:Amor_Kiz:1330575827611549867> **Você também pode ver o passo a passo de como criar e configurar clicando no botão (Tutorial Gamepass).**\n\n` +
                        `✔️ **Compra mínima: 100 robux. Caso tenha dúvidas, abra um ticket de suporte em <#1324083599993077841>.**`
                    )
                    .setFooter({ text: '© Lyz Store sua lojinha de robux!' });

                const botoesGamepass = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('gamepass_prosseguir_painel')
                        .setLabel('Já criei a gamepass / Prosseguir')
                        .setEmoji('1429177787700351167')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setLabel('Tutorial Gamepass')
                        .setEmoji('1332421740097441845')
                        .setStyle(ButtonStyle.Link)
                        .setURL('https://discord.com/channels/1317689887729651722/1519873159678005379'),
                    new ButtonBuilder()
                        .setCustomId('gamepass_calculadora')
                        .setLabel('Calculadora')
                        .setEmoji('1495095690135732335')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('corrigir_usuario_roblox')
                        .setLabel('Mudar Nick do Roblox')
                        .setEmoji('1495098245431689444')
                        .setStyle(ButtonStyle.Secondary)
                );

                await interaction.editReply({ embeds: [embedGamepass], components: [botoesGamepass] }).catch(err => console.error(err));
                return;
            }
        }

        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'modal_calculadora_robux') {
                if (interaction.replied || interaction.deferred) return;
                await interaction.deferUpdate().catch(err => console.error(err));
                const valorDigitado = interaction.fields.getTextInputValue('calc_input_valor');
                const quantidade = parseInt(valorDigitado.replace(/\D/g, ''), 10);

                // 8. SEGURANÇA (Validação estrita de limites da calculadora)
                if (isNaN(quantidade) || quantidade <= 0 || !isFinite(quantidade) || quantidade > 9999999) {
                    return await interaction.followUp({ content: '❌ Digite uma quantidade válida e dentro dos limites permitidos.', flags: [MessageFlags.Ephemeral] }).catch(err => console.error(err));
                }

                const precoFinal = (quantidade / 100) * 4.50;
                const valorComTaxa = Math.ceil(quantidade / 0.7);

                const embedResultadoCalc = new EmbedBuilder()
                    .setColor('#FFB6C1')
                    .setTitle('<:emoji_47:1495095690135732335> Resultado do Cálculo')
                    .setDescription(
                        `<:robux:1431836604737261608> **Quantidade desejada:** \`${quantidade} Robux\`\n` +
                        `<a:emoji3:1520079500673552444> **Valor total:** \`R$ ${precoFinal.toFixed(2).replace('.', ',')}\`\n\n` +
                        `<:traoms:1431738922177790064> **Valor para colocar na Gamepass (com taxa de 30% do Roblox):** \`${valorComTaxa} Robux\`\n` +
                        `*Garante que você receberá exatamente os ${quantidade} Robux!*`
                    )
                    .setFooter({ text: '© Lyz Store ~ Calculadora de robux' });

                const botoesCalculadora = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('gamepass_voltar_painel')
                        .setLabel('Voltar')
                        .setEmoji('1519875821865668608')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('gamepass_calculadora_repetir')
                        .setLabel('Calcular Outro')
                        .setEmoji('1495095690135732335')
                        .setStyle(ButtonStyle.Secondary)
                );

                await interaction.editReply({ embeds: [embedResultadoCalc], components: [botoesCalculadora] }).catch(err => console.error(err));
                return;
            }

            if (interaction.customId === 'modal_link_gamepass') {
                if (interaction.replied || interaction.deferred) return;
                await interaction.deferReply().catch(err => console.error(err));

                const valorDigitado = interaction.fields.getTextInputValue('modal_quantia_valor');
                const quantidade = parseInt(valorDigitado.replace(/\D/g, ''), 10);
                const linkIdDigitado = interaction.fields.getTextInputValue('modal_link_id_valor').trim();

                // 8. SEGURANÇA E CONTRATOS (Filtro rigoroso contra negativos, NaN, Infinity, Mínimos e Máximos)
                if (isNaN(quantidade) || quantidade < 100 || !isFinite(quantidade) || quantidade > 9999999) {
                    return await interaction.editReply({ content: '❌ A quantidade mínima para compra é de **100 Robux**.' }).catch(err => console.error(err));
                }

                // 1. ENFORÇAMENTO EXCLUSIVO DE ID (Rejeita links, aceita estritamente apenas números limpos)
                const matchId = linkIdDigitado.match(/^(\d+)$/);
                if (!matchId) {
                    return await interaction.editReply({ content: '❌ Não consegui identificar um ID de Gamepass válido. Verifique se o link enviado é de uma Gamepass e não de um catálogo ou jogo.' }).catch(err => console.error(err));
                }

                const gamepassId = matchId[1];
                const valorComTaxa = Math.ceil(quantidade / 0.7);

                // 10. CACHE (Leitura limpa e segura do global para merge estruturado)
                const sessaoUsuario = global.dadosPedidos.get(interaction.channel.id) || {};
                const targetUserId = sessaoUsuario.robloxId;
                let robloxUsername = sessaoUsuario.robloxUsername || "Não Encontrado";

                if (!targetUserId) {
                    return await interaction.editReply({ content: '❌ Sessão não encontrada. Por favor, reinicie informando o usuário do Roblox.' }).catch(err => console.error(err));
                }

                try {
                    let rawApiData = null;
                    let apiError = null;

                    // 6. TRATAMENTO DE API (Endpoint Principal com Fallback Estruturado)
                    try {
                        const resApi = await robloxRequestWithRetry({
                            method: 'get',
                            url: `https://economy.roblox.com/v1/game-passes/${gamepassId}/product-info`,
                            timeout: 6000
                        });
                        if (resApi.data && (resApi.data.Name || resApi.data.name || resApi.data.title)) {
                            rawApiData = resApi.data;
                        }
                    } catch (e) {
                        apiError = e;
                    }

                    if (!rawApiData) {
                        try {
                            const resFallback = await robloxRequestWithRetry({
                                method: 'get',
                                url: `https://apis.roblox.com/game-passes/v1/game-passes/${gamepassId}/product-info`,
                                timeout: 6000
                            });
                            if (resFallback.data && (resFallback.data.Name || resFallback.data.name || resFallback.data.title)) {
                                rawApiData = resFallback.data;
                            }
                        } catch (e) {
                            console.error('[API FALLBACK INFO ERRO]', e.message);
                        }
                    }

                    // 8. SEGURANÇA (Se ambas as apis falharem ou retornarem dados incompletos)
                    if (!rawApiData) {
                        throw apiError || new Error('Falha total ao obter dados públicos da Gamepass.');
                    }

                    // 5. ATRIBUIÇÃO DO OBJETO INTEGRAL NORMALIZADO
                    const normalizedGP = normalizeRobloxGamepass(rawApiData);
                    if (!normalizedGP || !normalizedGP.nome) {
                        return await interaction.editReply({ content: '❌ Resposta inválida ou incompleta obtida da API do Roblox.' }).catch(err => console.error(err));
                    }

                    // 4. VERIFICAÇÃO ATUALIZADA (Evita falsos negativos e nunca barra sem provas absolutas)
                    const ownership = await verifyGamepassByUserList(targetUserId, gamepassId, normalizedGP);
                    
                    if (!ownership.success) {
                        return await interaction.editReply({ 
                            content: `❌ **Segurança:** A Gamepass \`${normalizedGP.nome}\` não pertence à conta do usuário \`${robloxUsername}\` informada neste carrinho.` 
                        }).catch(err => console.error(err));
                    }

                    // Validação exata do preço com taxa
                    if (normalizedGP.preco !== valorComTaxa) {
                        return await interaction.editReply({ 
                            content: `❌ **O preço da Gamepass está incorreto!**\nVocê digitou que quer receber \`${quantidade} Robux\` (o que exige que a Gamepass custe \`${valorComTaxa} Robux\`), mas a sua Gamepass chamada \`${normalizedGP.nome}\` está configurada custando \`${normalizedGP.preco} Robux\`. Corrija o preço no site do Roblox e tente de novo!` 
                        }).catch(err => console.error(err));
                    }

                    // 9. NOME DO CANAL (Preserva perfeitamente emojis e caracteres Unicode reais do Discord)
                    try {
                        const rawNewName = `🛒-${interaction.user.username}-${quantidade}`;
                        const cleanNewName = rawNewName
                            .trim()
                            .replace(/[\s\t\n\r]+/g, '-') // substitui espaços por traços
                            .slice(0, 100);
                        if (cleanNewName.length > 0) {
                            await interaction.channel.setName(cleanNewName);
                        }
                    } catch (err) {
                        console.error('[Erro ao renomear canal]:', err);
                    }

                    const precoTotalOriginal = (quantidade / 100) * 4.50;

                    // 10. CACHE MERGE COMPLETO (Garante que nenhuma chave anterior da sessão seja perdida)
                    const dadosAtuais = global.dadosPedidos.get(interaction.channel.id) || {};
                    global.dadosPedidos.set(interaction.channel.id, {
                        ...dadosAtuais,
                        usuario: robloxUsername,
                        gamepass: normalizedGP.nome,
                        gamepassId: gamepassId,
                        quantidadeRobux: quantidade,
                        valorTaxado: valorComTaxa,
                        precoOriginal: precoTotalOriginal,
                        precoAtual: precoTotalOriginal,
                        cupomAplicado: dadosAtuais.cupomAplicado || null
                    });

                    const embedConfirmacaoFinal = new EmbedBuilder()
                        .setColor('#FFB6C1')
                        .setTitle('<:glt_bearitimaliaaa:1431736766993268997> Detalhes da sua Compra:')
                        .setDescription(
                            `\n` +
                            `<:user:1495098245431689444> **Usuário Roblox:** \`${robloxUsername}\`\n` +
                            `<:pinkgiftbox:1520141729833943070> **Gamepass:** \`${normalizedGP.nome}\` (\`${gamepassId}\`)\n` +
                            `<:robux:1431836604737261608> **Quantia de robux:** \`${valorComTaxa} (recebe ${quantidade})\`\n` +
                            `<a:emoji3:1519874879976116388> **Preço Total:** \`R$ ${precoTotalOriginal.toFixed(2).replace('.', ',')}\`\n\n` +
                            `**Se tudo estiver correto, avançe para a etapa de pagamento clicando no botão abaixo.**`
                        )
                        .setFooter({ text: '© Lyz Store ~ Sua lojinha de robux' });

                    const botoesPedido = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('pedido_confirmar')
                            .setLabel('Confirmar Pedido')
                            .setEmoji('1495097441622425870')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId('pedido_cupom')
                            .setLabel('Cupom')
                            .setEmoji('1477291290566721536')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('gamepass_prosseguir_painel')
                            .setLabel('Alterar Pedido')
                            .setEmoji('1429177787700351167')
                            .setStyle(ButtonStyle.Secondary)
                    );

                    await interaction.editReply({ embeds: [embedConfirmacaoFinal], components: [botoesPedido] }).catch(err => console.error(err));

                } catch (err) {
                    console.error('[Erro Geral Processamento Gamepass]:', err);
                    await interaction.editReply({ content: '⚠️ Ocorreu um erro ao checar a API do Roblox. Certifique-se de que o ID inserido é de uma Gamepass pública e ativa.' }).catch(err => console.error(err));
                }
            }
        }
    },
};