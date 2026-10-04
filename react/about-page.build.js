(() => {
  (() => {
    const { Layout, mountPage, InfoSkinShowcase, useI18n } = window.CS2React;
    const CONTACT_EMAIL = "enquiries@csprice.eu";
    function renderWithTokens(text, nodes) {
      const parts = String(text || "").split(/(\{[a-zA-Z]+\})/g);
      return parts.map((part, index) => {
        const match = part.match(/^\{([a-zA-Z]+)\}$/);
        if (match && nodes[match[1]]) {
          return /* @__PURE__ */ React.createElement(React.Fragment, { key: index }, nodes[match[1]]);
        }
        return /* @__PURE__ */ React.createElement(React.Fragment, { key: index }, part);
      });
    }
    function AboutPage() {
      const { t } = useI18n();
      return /* @__PURE__ */ React.createElement(Layout, null, /* @__PURE__ */ React.createElement("div", { className: "info-shell" }, /* @__PURE__ */ React.createElement("div", { className: "info-main" }, /* @__PURE__ */ React.createElement("header", { className: "info-head" }, /* @__PURE__ */ React.createElement("div", { className: "info-kicker" }, "CSPRICE"), /* @__PURE__ */ React.createElement("h1", null, t("about_title")), /* @__PURE__ */ React.createElement("p", null, t("about_intro"))), /* @__PURE__ */ React.createElement("div", { className: "info-body" }, /* @__PURE__ */ React.createElement("section", { className: "info-section" }, /* @__PURE__ */ React.createElement("h2", null, t("about_sourceTitle")), /* @__PURE__ */ React.createElement("p", null, t("about_sourceBody"))), /* @__PURE__ */ React.createElement("section", { className: "info-section" }, /* @__PURE__ */ React.createElement("h2", null, t("about_enquiriesTitle")), /* @__PURE__ */ React.createElement("p", null, renderWithTokens(t("about_enquiriesBody"), {
        contact: /* @__PURE__ */ React.createElement("a", { href: "contact.html" }, t("about_contactLink")),
        email: /* @__PURE__ */ React.createElement("a", { href: `mailto:${CONTACT_EMAIL}` }, CONTACT_EMAIL)
      }))), /* @__PURE__ */ React.createElement("section", { className: "info-section" }, /* @__PURE__ */ React.createElement("h2", null, t("about_creditTitle")), /* @__PURE__ */ React.createElement("p", null, t("about_creditIntro")), /* @__PURE__ */ React.createElement("ul", null, /* @__PURE__ */ React.createElement("li", null, t("about_creditValve")), /* @__PURE__ */ React.createElement("li", null, t("about_creditMarkets")))))), /* @__PURE__ */ React.createElement(InfoSkinShowcase, null)));
    }
    mountPage(/* @__PURE__ */ React.createElement(AboutPage, null));
  })();
})();
