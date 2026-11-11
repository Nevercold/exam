export default defineAppConfig({
  ui: {
    colors: {
      primary: 'emerald',
      neutral: 'zinc',
    },
    modal: {
      compoundVariants: [{
        scrollable: false,
        fullscreen: false,
        // Center without translate(-50%): odd modal heights land on half pixels and Chrome renders the text blurry
        class: {
          content: 'inset-0 top-0 left-0 m-auto h-fit translate-x-0 translate-y-0',
        },
      }],
    },
  },
})
