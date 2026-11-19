# Mio Mix

## Regras do projeto

- Projeto: **Mio Mix**.
- Backend e hospedagem: **AWS Amplify Gen 2**.
- Região AWS: **eu-north-1** (use-a em todos os comandos, recursos e configurações, salvo instrução em contrário).
- Perfil AWS: **miomix** (por exemplo, `--profile miomix` ou `AWS_PROFILE=miomix`).
- Textos do site voltados aos clientes: **alemão (padrão)**, **português do Brasil** e **inglês**, escolhidos pelo seletor de idioma. Todo texto novo para clientes precisa existir nos três idiomas (dicionário em `src/i18n/customer.ts`; mensagens do servidor nas próprias funções). Textos legais (Impressum, Datenschutz) valem em alemão; as traduções trazem esse aviso.
- Painel staff (`/staff`): **alemão e português** (`src/i18n/staff.ts`).

<!-- BEGIN AWS AGENT TOOLKIT RULES -->
<!-- PENDENTE: colar aqui o conteúdo de
     https://github.com/aws/agent-toolkit-for-aws/blob/main/rules/aws-agent-rules.md
     (arquivo de regras recomendado pelo AWS Agent Toolkit para o CLAUDE.md). -->
<!-- END AWS AGENT TOOLKIT RULES -->
