import { readFileSync } from 'node:fs';
import path from 'node:path';

// 插件自带 skill 的注册优先级：高于用户目录（400），低于内置 bundled（600）。
const SKILL_RANK = 550;
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u;

/** 读取 SKILL.md，校验名称/描述并返回正文（去掉 frontmatter）。 */
export function readSkill(dir, expectedName) {
  const file = path.join(dir, 'SKILL.md');
  const raw = readFileSync(file, 'utf8');
  const match = FRONTMATTER.exec(raw);
  if (!match) throw new Error(`${file} 缺少 YAML frontmatter`);
  const field = key => new RegExp(`^${key}:\\s*(.+)$`, 'mu').exec(match[1])?.[1]?.trim().replace(/^["']|["']$/gu, '');
  const name = field('name');
  const description = field('description');
  if (name !== expectedName) throw new Error(`${file} 的 name 应为 ${expectedName}`);
  if (!description) throw new Error(`${file} 缺少 description`);
  return { name, description, content: raw.slice(match[0].length).trim() };
}

/**
 * 把插件自带的 SKILL.md 注册到 DSH skill 注册表。
 * @param ctx 宿主上下文，需注入 skills 服务。
 * @param options.name skill 名（与 SKILL.md frontmatter 一致）。
 * @param options.dir 含 SKILL.md 的目录绝对路径。
 */
export function mountSkill(ctx, { name, dir }) {
  const base = dir.split(path.sep).join('/');
  const skill = readSkill(dir, name);
  const candidate = {
    name,
    description: skill.description,
    invocation: { modelInvocable: true, userInvocable: true },
    provider: 'pocket-kit',
    source: 'pocket-kit',
    rank: SKILL_RANK,
    resourceBase: { kind: 'directory', path: base },
    locator: path.join(dir, 'SKILL.md')
  };
  ctx.effect(() => ctx.skills.registerProvider(() => ({
    name: 'pocket-kit',
    list: () => Promise.resolve([candidate]),
    get: async (target, options) => {
      if (target.name !== name) throw new Error(`未知 skill: ${target.name}`);
      options?.signal?.throwIfAborted?.();
      const { rank: _rank, locator: _locator, ...summary } = candidate;
      return { ...summary, content: skill.content };
    }
  })));
}
