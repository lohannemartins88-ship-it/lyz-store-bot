const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

global.cuponsAtivos = global.cuponsAtivos || new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cupom')
        .setDescription('Gerenciamento de cupons de desconto da Lyz Store.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        // /cupom criar
        .addSubcommand(sub =>
            sub.setName('criar')
                .setDescription('Cria um novo cupom para um parceiro.')
                .addStringOption(opt => opt.setName('codigo').setDescription('Código do cupom (Ex: LYZ10)').setRequired(true))
                .addStringOption(opt => opt.setName('tipo').setDescription('Tipo do desconto').setRequired(true).addChoices(
                    { name: 'Porcentagem (%)', value: 'porcentagem' },
                    { name: 'Fixo (R$)', value: 'fixo' }
                ))
                .addNumberOption(opt => opt.setName('valor').setDescription('Valor do desconto (Número limpo)').setRequired(true))
                .addIntegerOption(opt => opt.setName('usos').setDescription('Quantidade máxima de usos (Opcional)').setRequired(false))
        )
        // /cupom deletar
        .addSubcommand(sub =>
            sub.setName('deletar')
                .setDescription('Desativa um cupom e preserva o historico.')
                .addStringOption(opt => opt.setName('codigo').setDescription('Código do cupom que deseja desativar').setRequired(true))
        )
        // /cupom editar
        .addSubcommand(sub =>
            sub.setName('editar')
                .setDescription('Edita um cupom existente.')
                .addStringOption(opt => opt.setName('codigo').setDescription('Código do cupom a ser modificado').setRequired(true))
                .addNumberOption(opt => opt.setName('novo_valor').setDescription('Novo valor do desconto').setRequired(true))
        )
        // /cupom ver
        .addSubcommand(sub =>
            sub.setName('ver')
                .setDescription('Visualiza um cupom ou lista cupons de um parceiro.')
                .addStringOption(opt => opt.setName('codigo').setDescription('Código específico para consultar (Deixe vazio para listar todos)').setRequired(false))
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'criar') {
            const codigo = interaction.options.getString('codigo').toUpperCase().trim();
            const tipo = interaction.options.getString('tipo');
            const valor = interaction.options.getNumber('valor');
            const maxUsos = interaction.options.getInteger('usos') || Infinity;

            if (valor <= 0) {
                return interaction.reply({ content: '❌ O valor do desconto deve ser maior que zero.', ephemeral: true });
            }

            global.cuponsAtivos.set(codigo, {
                tipo,
                valor,
                maxUsos,
                usosAtuais: 0,
                criadoEm: new Date()
            });

            return interaction.reply({
                content: `✅ **Cupom Criado com Sucesso!**\n🎫 Código: \`${codigo}\`\n📊 Tipo: \`${tipo}\`\n💰 Valor: \`${valor}\`\n👥 Limite de Usos: \`${maxUsos === Infinity ? 'Ilimitado' : maxUsos}\``,
                ephemeral: true
            });
        }

        if (subcommand === 'deletar') {
            const codigo = interaction.options.getString('codigo').toUpperCase().trim();

            if (!global.cuponsAtivos.has(codigo)) {
                return interaction.reply({ content: '❌ Esse cupom não foi encontrado no sistema.', ephemeral: true });
            }

            global.cuponsAtivos.delete(codigo);
            return interaction.reply({ content: `🗑️ O cupom \`${codigo}\` foi deletado com sucesso do painel ativo.`, ephemeral: true });
        }

        if (subcommand === 'editar') {
            const codigo = interaction.options.getString('codigo').toUpperCase().trim();
            const novoValor = interaction.options.getNumber('novo_valor');

            if (!global.cuponsAtivos.has(codigo)) {
                return interaction.reply({ content: '❌ Esse cupom não existe para ser editado.', ephemeral: true });
            }

            if (novoValor <= 0) {
                return interaction.reply({ content: '❌ Digite um valor de desconto válido.', ephemeral: true });
            }

            const dadosCupom = global.cuponsAtivos.get(codigo);
            dadosCupom.valor = novoValor;
            global.cuponsAtivos.set(codigo, dadosCupom);

            return interaction.reply({ content: `📝 O cupom \`${codigo}\` foi atualizado para o novo valor de \`${novoValor}\`.`, ephemeral: true });
        }

        if (subcommand === 'ver') {
            const codigo = interaction.options.getString('codigo');

            if (codigo) {
                const busca = codigo.toUpperCase().trim();
                const cupom = global.cuponsAtivos.get(busca);

                if (!cupom) {
                    return interaction.reply({ content: `❌ Cupom \`${busca}\` não localizado.`, ephemeral: true });
                }

                return interaction.reply({
                    content: `🎫 **Dados do Cupom [${busca}]:**\n• Tipo: \`${cupom.tipo}\`\n• Valor: \`${cupom.valor}\`\n• Usos: \`${cupom.usosAtuais}/${cupom.maxUsos === Infinity ? 'Ilimitado' : cupom.maxUsos}\``,
                    ephemeral: true
                });
            } else {
                if (global.cuponsAtivos.size === 0) {
                    return interaction.reply({ content: '🎫 Nenhum cupom ativo no momento na Lyz Store.', ephemeral: true });
                }

                let lista = "";
                for (const [key, val] of global.cuponsAtivos.entries()) {
                    lista += `• **${key}** | Tipo: \`${val.tipo}\` | Valor: \`${val.valor}\` | Usos: \`${val.usosAtuais}/${val.maxUsos === Infinity ? 'Ilimitado' : val.maxUsos}\`\n`;
                }

                const embedLista = new EmbedBuilder()
                    .setColor('#FFB6C1')
                    .setTitle('🎫 Cupons Ativos - Lyz Store')
                    .setDescription(lista);

                return interaction.reply({ embeds: [embedLista], ephemeral: true });
            }
        }
    }
};