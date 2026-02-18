import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
    title: "Mount0",
    tagline: "High-performance virtual filesystem infrastructure",
    favicon: "img/favicon.ico",

    future: {
        v4: true,
    },

    plugins: [
        [
            "docusaurus-plugin-typedoc",
            {
                entryPoints: ["../packages/core/src/index.ts"],
                tsconfig: "../tsconfig.json",
                out: "./docs/types",
                readme: "none",
            },
        ],
    ],

    url: "https://docs.mount0.com",
    baseUrl: "/",
    organizationName: "mensreversa",
    projectName: "mount0",

    onBrokenLinks: "warn",
    markdown: {
        format: "mdx",
    },

    i18n: {
        defaultLocale: "en",
        locales: ["en"],
    },

    presets: [
        [
            "classic",
            {
                docs: {
                    sidebarPath: "./sidebars.ts",
                    routeBasePath: "/",
                    editUrl: "https://github.com/mensreversa/mount0/tree/main/docs/",
                },
                blog: {
                    showReadingTime: true,
                    editUrl: "https://github.com/mensreversa/mount0/tree/main/docs/",
                },
                theme: {
                    customCss: "./src/css/custom.css",
                },
            } satisfies Preset.Options,
        ],
    ],

    themeConfig: {
        image: "img/docusaurus-social-card.jpg",
        colorMode: {
            defaultMode: "dark",
            disableSwitch: true,
            respectPrefersColorScheme: false,
        },
        navbar: {
            title: "Mount0",
            logo: {
                alt: "Mount0 Logo",
                src: "img/logo.svg",
                href: "https://mount0.com",
                target: "_self",
            },
            items: [
                {
                    type: "docSidebar",
                    sidebarId: "tutorialSidebar",
                    position: "left",
                    label: "Documentation",
                },
                {
                    type: "docSidebar",
                    sidebarId: "apiSidebar",
                    position: "left",
                    label: "API",
                },
                { to: "/blog", label: "Blog", position: "left" },
                {
                    href: "https://github.com/mensreversa/mount0",
                    label: "GitHub",
                    position: "right",
                },
            ],
        },
        footer: {
            style: "dark",
            links: [
                {
                    title: "Docs",
                    items: [
                        {
                            label: "Introduction",
                            to: "/",
                        },
                        {
                            label: "API Reference",
                            to: "/types",
                        },
                    ],
                },
                {
                    title: "Community",
                    items: [
                        {
                            label: "Stack Overflow",
                            href: "https://stackoverflow.com/questions/tagged/mount0",
                        },
                        {
                            label: "Discord",
                            href: "https://discordapp.com/invite/mensreversa",
                        },
                        {
                            label: "X",
                            href: "https://x.com/mensreversa",
                        },
                    ],
                },
                {
                    title: "More",
                    items: [
                        {
                            label: "GitHub",
                            href: "https://github.com/mensreversa/mount0",
                        },
                        {
                            label: "Mens Reversa",
                            href: "https://mensreversa.com",
                        },
                    ],
                },
            ],
            copyright: `Copyright © ${new Date().getFullYear()} MENS REVERSA SRL. Built with Docusaurus.`,
        },
        prism: {
            theme: prismThemes.vsDark,
            darkTheme: prismThemes.vsDark,
            additionalLanguages: ["bash", "json", "typescript"],
        },
    } satisfies Preset.ThemeConfig,
};

export default config;
