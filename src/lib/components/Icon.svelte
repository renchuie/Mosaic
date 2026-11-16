<script lang="ts">
  // Small stroke icon set (24px grid) so the app needs no icon font.
  const paths: Record<string, string> = {
    dashboard: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
    labs: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M7.5 15h9",
    calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
    tasks: "M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17M11 6h9M11 12h9M11 18h9",
    courses: "M3 9l9-5 9 5-9 5zM7 11.5V16c0 1 2.2 2.5 5 2.5s5-1.5 5-2.5V11.5M21 9v6",
    settings: "M4 7h10M18 7h2M4 17h2M10 17h10M14 4.5v5h4v-5zM6 14.5v5h4v-5z",
    play: "M8 5l11 7-11 7z",
    pause: "M8 5v14M16 5v14",
    arrow: "M7 17L17 7M9 7h8v8",
    check: "M5 12.5l4.5 4.5L19 7.5",
    flame: "M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .5 2 1.5 2.5 2 2.5C11 9 10.5 6 12 3z",
    clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
    folder: "M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z",
    note: "M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5",
    file: "M7 3h7l4 4v14H7zM14 3v4h4",
    refresh: "M20 11a8 8 0 0 0-14.5-4.5M4 4v3.5h3.5M4 13a8 8 0 0 0 14.5 4.5M20 20v-3.5h-3.5",
    back: "M15 18l-6-6 6-6",
    repeat: "M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4",
    pin: "M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
    book: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5",
    dots: "M5 12h.01M12 12h.01M19 12h.01",
    panel: "M4 5h16v14H4zM9.5 5v14",
    flag: "M5 21V4M5 4h11l-2 4 2 4H5",
    external: "M14 4h6v6M20 4l-9 9M18 14v5H5V6h5",
  };
  let { name, size = 20 }: { name: string; size?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.7"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d={paths[name]} />
</svg>
