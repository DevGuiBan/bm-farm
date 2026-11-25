// Dados fictícios do ambiente local.
import { randomUUID } from "node:crypto";

export const SENHA = "senha-forte-123";
export const EQUIPE = [
  ["Carla Nunes", "admin@agencia.com", "admin", 0], ["Ana Lima", "ana@agencia.com", "operador", 12],
  ["Bruno Reis", "bruno@agencia.com", "operador", 10], ["Davi Costa", "davi@agencia.com", "operador", 8],
];
const EMPRESAS = ["Padaria Boa Massa", "Clínica Horizonte", "Oficina Dois Irmãos", "Studio Alecrim", "Mercado Vila Nova", "Pet Amigo",
  "Ótica Clara", "Academia Pulso", "Floricultura Jasmim", "Construtora Pilar", "Escola Aprender", "Café Serrano", "Transportes Rota Sul",
  "Barbearia Navalha", "Papelaria Traço", "Imobiliária Lar", "Doceria Canela", "Auto Peças Lima", "Farmácia Vida", "Restaurante Maré",
  "Lavanderia Limpa", "Gráfica Cor", "Salão Beleza Pura", "Móveis Cedro"];
const FLUXO = ["documentos", "site", "meta", "verificacao", "concluido"];
const ETAPAS = [0, 2, 3, 1, 0, 1, 2, 3, 0, 0, 1, 2]; // das empresas 12 a 23; as anteriores estão concluídas
const HORA = 36e5;

export async function popular(db) {
  const ids = {};
  for (const [nome, email, papel, meta] of EQUIPE) {
    ids[email] = randomUUID();
    await db.query("insert into auth.users values ($1, $2, $3)", [ids[email], email, SENHA]);
    await db.query("insert into profiles (id, full_name, email, role, monthly_goal) values ($1, $2, $3, $4, $5)", [ids[email], nome, email, papel, meta]);
  }
  const ops = ["ana", "ana", "bruno", "davi"].map((n) => ids[`${n}@agencia.com`]);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  for (const [i, nome] of EMPRESAS.entries()) {
    const op = ops[i % 4], cnpj = String(10000000000000 + i * 137), email = `contato@empresa${i}.com.br`;
    const registro = { situacao: "ATIVA", cnae: "Comércio varejista", endereco: "Rua das Flores 100 Centro", municipio: "São Paulo", uf: "SP", email, telefone: "1133330000" };
    const { rows: [{ id }] } = await db.query(
      "select create_client($1, $2, $3, $4, $5, array['JOSE SILVA'], 'José Silva', '(11) 98888-0000', $6, $7, false) id",
      [ids["admin@agencia.com"], cnpj, `${nome.toUpperCase()} LTDA`, nome, JSON.stringify(registro), op, i === 11 ? "existente" : "novo"]);
    const etapa = i < 12 ? 4 : ETAPAS[i - 12];
    let t = Date.now() - (6 + rnd() * 22) * 24 * HORA;
    for (let s = 0; s < etapa; s++) {
      const fim = Math.min(t + (6 + rnd() * 70) * HORA, Date.now() - HORA);
      await db.query(
        `insert into stage_history (client_id, stage, operator_id, entered_at, left_at, to_stage, outcome, counts_for_operator, moved_by)
         select $1, stage, $3, $4, $5, $6, 'avanco', counts_for_operator, $3 from stage_settings where stage = $2`,
        [id, FLUXO[s], op, new Date(t), new Date(fim), FLUXO[s + 1]]);
      await db.query("insert into activity_log (actor_id, client_id, action, meta, created_at) values ($1, $2, 'etapa_avanco', $3, $4)",
        [op, id, JSON.stringify({ de: FLUXO[s], para: FLUXO[s + 1] }), new Date(fim)]);
      t = fim;
    }
    const concluiu = etapa === 4 ? new Date(t) : null;
    const entrou = concluiu ?? new Date(Date.now() - rnd() * 60 * HORA);
    await db.query("update clients set stage = $2, stage_entered_at = $3, priority = $4, domain = $5, public_phone = $6, completed_at = $7 where id = $1",
      [id, FLUXO[etapa], entrou, 1 + (i % 3), etapa > 1 ? `empresa${i}.com.br` : null, etapa > 1 ? "(11) 3333-0000" : null, concluiu]);
  }
}
