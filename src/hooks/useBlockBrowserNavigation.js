import { useEffect } from "react";

const useBlockBrowserNavigation = (enabled = true) => {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const getCurrentUrl = () =>
      window.location.pathname +
      window.location.search +
      window.location.hash;

    const lockCurrentPage = () => {
      window.history.pushState(
        {
          browserNavigationBlocked: true,
          lockedUrl: getCurrentUrl(),
        },
        "",
        getCurrentUrl()
      );
    };

    lockCurrentPage();

    const handlePopState = () => {
      /*
       * Back किंवा Forward दाबल्यावर
       * user ला current route वरच ठेवते.
       */
      window.history.go(1);
    };

    window.addEventListener(
      "popstate",
      handlePopState
    );

    return () => {
      window.removeEventListener(
        "popstate",
        handlePopState
      );
    };
  }, [enabled]);
};

export default useBlockBrowserNavigation;