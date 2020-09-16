import path from 'path';
import fs from 'fs-extra';
import { parseBuildPerf } from './utils';
import externalHelpers from './externalHelpers';
import { HookOptions, Hook } from './hookInterface/types';
import prepareShortcodeParser from './utils/prepareShortcodeParser';

const hooks: Array<HookOptions> = [
  {
    hook: 'bootstrap',
    name: 'elderAddExternalHelpers',
    description: 'Adds external helpers to helpers object',
    priority: 1,
    run: async ({ helpers, query, settings }) => {
      let additionalHelpers = {};
      try {
        additionalHelpers = await externalHelpers({ helpers, query, settings });
      } catch (err) {
        console.error(err);
      }
      if (additionalHelpers) {
        return {
          helpers: {
            ...helpers,
            ...additionalHelpers,
          },
        };
      }
      return null;
    },
  },
  {
    hook: 'shortcodes',
    name: 'elderProcessShortcodes',
    description:
      "Builds the shortcode parser, parses shortcodes from the html returned by the route's html and appends anything needed to the stacks.",
    priority: 50,
    run: async ({
      helpers,
      data,
      settings,
      request,
      query,
      cssStack,
      headStack,
      customJsStack,
      routeHtml,
      shortcodes,
      allRequests,
    }) => {
      const ShortcodeParser = prepareShortcodeParser({
        shortcodes,
        helpers,
        data,
        settings,
        request,
        query,
        cssStack,
        headStack,
        customJsStack,
        allRequests,
      });

      const html = await ShortcodeParser.parse(routeHtml);

      return {
        routeHtml: html,
        headStack,
        cssStack,
        customJsStack,
      };
    },
  },
  {
    hook: 'stacks',
    name: 'elderAddMetaCharsetToHead',
    description: `Adds <meta charset="UTF-8" /> to the head.`,
    priority: 100,
    run: async ({ headStack }) => {
      return {
        headStack: [
          ...headStack,
          {
            source: 'elderAddMetaCharsetToHead',
            string: `<meta charset="UTF-8" />`,
            priority: 100,
          },
        ],
      };
    },
  },
  {
    hook: 'stacks',
    name: 'elderAddMetaViewportToHead',
    description: `Adds <meta name="viewport" content="width=device-width, initial-scale=1" /> to the head.`,
    priority: 90,
    run: async ({ headStack }) => {
      return {
        headStack: [
          ...headStack,
          {
            source: 'elderAddMetaViewportToHead',
            string: `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
            priority: 90,
          },
        ],
      };
    },
  },
  {
    hook: 'stacks',
    name: 'elderAddDefaultIntersectionObserver',
    description: 'Sets up the default polyfill for the intersection observer',
    priority: 100,
    run: async ({ beforeHydrateStack }) => {
      return {
        beforeHydrateStack: [
          {
            source: 'elderAddDefaultIntersectionObserver',
            string: `<script type="text/javascript">
      if (!('IntersectionObserver' in window)) {
          var script = document.createElement("script");
          script.src = "/static/intersection-observer.js";
          document.getElementsByTagName('head')[0].appendChild(script);
      };
      </script>`,
            priority: 100,
          },
          ...beforeHydrateStack,
        ],
      };
    },
  },
  {
    hook: 'stacks',
    name: 'elderAddSystemJs',
    description: 'AddsSystemJs to beforeHydrateStack also add preloading of systemjs to the headStack.',
    priority: 1,
    run: async ({ beforeHydrateStack, headStack }) => {
      return {
        beforeHydrateStack: [
          {
            source: 'elderAddSystemJs',
            string: `<script src="/static/s.min.js"></script>`,
            priority: 99,
          },
          ...beforeHydrateStack,
        ],

        headStack: [
          {
            source: 'elderAddSystemJs',
            string: `<link rel="preload" href="/static/s.min.js" as="script">`,
            priority: 99,
          },
          ...headStack,
        ],
      };
    },
  },
  {
    hook: 'compileHtml',
    name: 'elderCompileHtml',
    description: 'Creates an HTML string out of the Svelte layout and stacks.',
    priority: 50,
    run: async ({ request, headString, footerString, layoutHtml, htmlString }) => {
      return {
        htmlString: `<!DOCTYPE html><html lang="en"><head>${headString}</head><body class="${request.route}">${layoutHtml}${footerString}</body></html>`,
      };
    },
  },

  {
    hook: 'error',
    name: 'elderConsoleLogErrors',
    description: 'Log any errors to the console.',
    priority: 1,
    run: async ({ errors, request }) => {
      console.error(request.permalink, errors);
    },
  },
  {
    hook: 'requestComplete',
    name: 'elderWriteHtmlFileToPublic',
    description: 'Write the html output to public.',
    priority: 1,
    run: async ({ settings, request, htmlString, errors }) => {
      if (settings.build) {
        const file = path.resolve(settings.paths.distDir, `.${request.permalink}/index.html`);
        try {
          fs.outputFileSync(file, htmlString);
        } catch (e) {
          console.log(e);
          return {
            errors: [...errors, e],
          };
        }
      }
      return null;
    },
  },
  {
    hook: 'requestComplete',
    name: 'elderDisplayRequestTime',
    description: 'Page generating timings and logging.',
    priority: 50,
    run: async ({ timings, request, settings }) => {
      if (!settings.build && process.env.NODE_ENV !== 'production') {
        console.log(`${Math.round(timings.slice(-1)[0].duration * 10) / 10}ms: \t ${request.permalink}`);
        if (settings.debug.performance) {
          const outTimings = [...timings];
          const display = outTimings.sort((a, b) => a.duration - b.duration).map((t) => ({ ...t, ms: t.duration }));

          console.table(display, ['name', 'ms']);
        }
      }
    },
  },
  {
    hook: 'buildComplete',
    name: 'elderShowParsedBuildTimes',
    description: 'A breakdown of the average times of different stages of the build.',
    priority: 50,
    run: async ({ timings, settings }) => {
      if (settings.debug.performance) {
        const buildTimings = parseBuildPerf(timings);
        console.log(buildTimings);
      }
    },
  },
  {
    hook: 'buildComplete',
    name: 'elderWriteBuildErrors',
    description: 'Writes out any errors of a build to a JSON file in the ___ELDER___ folder.',
    priority: 50,
    run: async ({ errors, settings }) => {
      if (errors && errors.length > 0) {
        const buildOutputLocation = path.resolve(settings.paths.rootDir, `./___ELDER___/build-${Date.now()}.json`);
        console.log(`Writing details on the ${errors.length} build errors to: ${buildOutputLocation}`);
        fs.writeJSONSync(buildOutputLocation, { errors, settings });
      }
    },
  },
];

export default hooks;
