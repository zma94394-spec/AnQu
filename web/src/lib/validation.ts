/**
 * ============================================================================
 *  发布表单的客户端校验
 *
 *  ⚠️ 这里每一条规则都是**逐条镜像后端 `createBuildBodySchema`**
 *     （后端真源：`src/schemas/builds.schema.ts`）。
 *     目的不是"更严格"，而是让用户在提交前就看到问题 ——
 *     后端仍会独立校验，前端校验只是体验优化，绝不是安全边界。
 *
 *  数值字段用 string 承载：空输入无法用 number 表达，
 *  而 "请输入造价" 与 "请输入 0" 是两种不同的错误，必须能区分。
 * ============================================================================
 */

import { TAG_MAX_COUNT, TAG_MAX_LENGTH } from '../types/ui';
import type { CreateBuildInput, Platform } from '../types/api';

export interface PublishFormValues {
  gun_id: string;
  title: string;
  code: string;
  /** 保留字符串形态，便于区分「未填」与「填了 0」 */
  estimated_cost: string;
  platform: Platform;
  tags: string[];
  description: string;
}

export type FieldErrors = Partial<Record<keyof PublishFormValues, string>>;

export const EMPTY_FORM: PublishFormValues = {
  gun_id: '',
  title: '',
  code: '',
  estimated_cost: '',
  platform: 'both',
  tags: [],
  description: '',
};

/* -------------------------------------------------- 与后端对齐的常量 */

/** 与后端 `CODE_PATTERN` 完全一致：可打印 ASCII（不含空白），8~2048 位 */
const CODE_PATTERN = /^[\x21-\x7E]{8,2048}$/;

const TITLE_MIN = 2;
const TITLE_MAX = 80;
const DESCRIPTION_MAX = 2000;
const COST_MAX = 999_999_999_999;

/** 需要校验的字段顺序，决定错误汇总的展示次序 */
export const FIELD_ORDER: Array<keyof PublishFormValues> = [
  'gun_id',
  'title',
  'code',
  'estimated_cost',
  'platform',
  'tags',
  'description',
];

/* ---------------------------------------------------------------- 校验 */

export function validateField(
  field: keyof PublishFormValues,
  values: PublishFormValues,
): string | undefined {
  switch (field) {
    case 'gun_id':
      return values.gun_id ? undefined : '请选择枪械';

    case 'title': {
      const title = values.title.trim();
      if (title.length === 0) return '标题必填';
      if (title.length < TITLE_MIN) return `标题至少 ${TITLE_MIN} 个字符`;
      if (title.length > TITLE_MAX) {
        return `标题最多 ${TITLE_MAX} 个字符（当前 ${title.length}）`;
      }
      return undefined;
    }

    case 'code': {
      const code = values.code.trim();
      if (code.length === 0) return '改枪码必填';
      // 单独判断空白，是为了给出比"格式非法"更具体的提示
      if (/\s/.test(code)) return '改枪码不能包含空格或换行，请重新粘贴';
      if (code.length < 8) return `改枪码至少 8 位（当前 ${code.length} 位）`;
      if (code.length > 2048) return `改枪码最多 2048 位（当前 ${code.length} 位）`;
      if (!CODE_PATTERN.test(code)) return '改枪码只能包含可打印字符，请检查是否混入了中文';
      return undefined;
    }

    case 'estimated_cost': {
      const raw = values.estimated_cost.trim();
      if (raw.length === 0) return '预估造价必填';
      if (!/^\d+$/.test(raw)) return '预估造价必须是非负整数（不要带逗号或单位）';
      const value = Number(raw);
      if (!Number.isSafeInteger(value)) return '预估造价数值过大';
      if (value > COST_MAX) return '预估造价超出允许范围';
      return undefined;
    }

    case 'tags': {
      if (values.tags.length > TAG_MAX_COUNT) {
        return `标签最多 ${TAG_MAX_COUNT} 个（当前 ${values.tags.length}）`;
      }
      const blank = values.tags.find((tag) => tag.trim().length === 0);
      if (blank !== undefined) return '标签不能为空';
      const tooLong = values.tags.find((tag) => tag.trim().length > TAG_MAX_LENGTH);
      if (tooLong !== undefined) {
        return `单个标签最多 ${TAG_MAX_LENGTH} 个字符：「${tooLong}」`;
      }
      return undefined;
    }

    case 'description': {
      if (values.description.length > DESCRIPTION_MAX) {
        return `方案说明最多 ${DESCRIPTION_MAX} 个字符（当前 ${values.description.length}）`;
      }
      return undefined;
    }

    case 'platform':
      return undefined;
  }
}

export function validateForm(values: PublishFormValues): FieldErrors {
  const errors: FieldErrors = {};
  for (const field of FIELD_ORDER) {
    const message = validateField(field, values);
    if (message !== undefined) errors[field] = message;
  }
  return errors;
}

/**
 * 表单值 -> 请求体。
 *
 * 两个**刻意不做静默归一化**的地方（均由 `npm run check:validation` 抓出并回归）：
 *
 *  1. **造价为空时整体省略字段**，而不是转成 0。
 *     `Number('')` 在 JS 里是 `0`，直接转换会把"没填"变成"造价 0 柯恩币"；
 *     省略字段则让后端的 `required_error` 正常触发，两端结论一致。
 *
 *  2. **保留纯空格的标签**，不 `.filter()` 掉。
 *     后端 `tags` 是 `z.string().trim().min(1)`，空标签本来就该被拒；
 *     前端先过滤掉会变成"前端拦下、后端其实也拦"的假分歧，
 *     更糟的是会静默丢弃用户输入。
 */
export function toCreateBuildInput(values: PublishFormValues): CreateBuildInput {
  const description = values.description.trim();
  const costRaw = values.estimated_cost.trim();

  const input: CreateBuildInput = {
    gun_id: values.gun_id,
    title: values.title.trim(),
    code: values.code.trim(),
    platform: values.platform,
    tags: values.tags.map((tag) => tag.trim()),
    description: description.length === 0 ? null : description,
  };

  // 仅在确实是非负整数时才带上该字段
  if (/^\d+$/.test(costRaw)) {
    input.estimated_cost = Number(costRaw);
  }

  return input;
}
