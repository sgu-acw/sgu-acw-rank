import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '.astro/**', '.playwright-mcp/**', 'tools/learning/vendor/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],

  {
    files: ['**/*.vue', '**/*.ts', '**/*.mjs'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
      },
      // 浏览器环境的全局变量。前端代码里用 window / document 是正常的。
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        location: 'readonly',
        history: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        URLSearchParams: 'readonly',
        URL: 'readonly',
        FormData: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLSelectElement: 'readonly',
        MouseEvent: 'readonly',
        KeyboardEvent: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        AbortController: 'readonly',
        BeforeUnloadEvent: 'readonly',
        requestAnimationFrame: 'readonly',
        getComputedStyle: 'readonly',
        matchMedia: 'readonly',
        Node: 'readonly',
      },
    },
  },

  {
    files: ['tools/**/*.{js,cjs,mjs,ts}'],
    languageOptions: {
      globals: {
        require: 'readonly', module: 'writable', process: 'readonly', __dirname: 'readonly',
        Buffer: 'readonly', console: 'readonly', URL: 'readonly', setTimeout: 'readonly',
        clearTimeout: 'readonly', setInterval: 'readonly', fetch: 'readonly', self: 'readonly',
        caches: 'readonly', TextEncoder: 'readonly', TextDecoder: 'readonly', Worker: 'readonly',
        AbortSignal: 'readonly', DOMException: 'readonly', MessageEvent: 'readonly',
      },
    },
    rules: {
      // tools/ 是 Node/Worker 脚本，不是打包产物，允许 CommonJS 与显式关检查的实验文件。
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },

  {
    rules: {
      /*
       * 模板里用了 script 中不存在的变量/函数。
       *
       * 这是这次真正要防的：我删代码时把 load() 和 percent() 一起删了，
       * 页面一直转圈。astro build 照过（只打包不检查），astro check 也
       * 不报（它不检查模板里的调用），只有运行时才炸。
       */
      'vue/no-undef-properties': 'error',

      // 组件名允许单个词，本项目里都是这样
      'vue/multi-word-component-names': 'off',
      // 属性换行规则太吵，排版交给 prettier 或人
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/attributes-order': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/first-attribute-linebreak': 'off',

      /*
       * shadcn 的 UI 组件里 prop 本来就是可选的（Input 的 placeholder、
       * Avatar 的 src 之类），要求每个都写默认值没有意义。
       */
      'vue/require-default-prop': 'off',

      // 未使用的变量在 TS 里已经有检查，这里放宽成警告
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // 抓取平台数据时确实需要 any 的场合不少
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
