## Legacy iPad Support (iOS 9.3.6)

For very old Safari (iPad 4 / iOS 9.3.6), use the legacy build:

- Open: https://troyanosaurus.github.io/beekeeping-app/legacy.html
- Uses React 17 UMD + polyfills (core-js + regenerator).
- Requires `app.jsx` to be UMD style:

  ```js
  /* global React, ReactDOM */
  const { useState, useEffect, useMemo, useRef } = React;
  window.BeekeepingApp = BeekeepingApp;
