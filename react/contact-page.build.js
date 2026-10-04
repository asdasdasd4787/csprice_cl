(() => {
  (() => {
    const { Layout, mountPage, InfoSkinShowcase, useI18n } = window.CS2React;
    const CONTACT_EMAIL = "enquiries@csprice.eu";
    function ContactPage() {
      const { t } = useI18n();
      return /* @__PURE__ */ React.createElement(Layout, null, /* @__PURE__ */ React.createElement("div", { className: "info-shell" }, /* @__PURE__ */ React.createElement("div", { className: "info-main" }, /* @__PURE__ */ React.createElement("header", { className: "info-head" }, /* @__PURE__ */ React.createElement("div", { className: "info-kicker" }, "CSPRICE"), /* @__PURE__ */ React.createElement("h1", null, t("contact_title")), /* @__PURE__ */ React.createElement("p", null, t("contact_intro"))), /* @__PURE__ */ React.createElement("div", { className: "info-body" }, /* @__PURE__ */ React.createElement("section", { className: "info-section" }, /* @__PURE__ */ React.createElement("h2", null, t("contact_aboutTitle")), /* @__PURE__ */ React.createElement("ul", null, /* @__PURE__ */ React.createElement("li", null, t("contact_b1")), /* @__PURE__ */ React.createElement("li", null, t("contact_b2")), /* @__PURE__ */ React.createElement("li", null, t("contact_b3")), /* @__PURE__ */ React.createElement("li", null, t("contact_b4")))), /* @__PURE__ */ React.createElement("section", { className: "info-section info-email-wrap" }, /* @__PURE__ */ React.createElement("h2", null, t("contact_emailTitle")), /* @__PURE__ */ React.createElement("p", null, t("contact_emailBody")), /* @__PURE__ */ React.createElement("a", { className: "info-email", href: `mailto:${CONTACT_EMAIL}` }, /* @__PURE__ */ React.createElement("i", { className: "fa-regular fa-envelope", "aria-hidden": "true" }), CONTACT_EMAIL)))), /* @__PURE__ */ React.createElement(InfoSkinShowcase, null)));
    }
    mountPage(/* @__PURE__ */ React.createElement(ContactPage, null));
  })();
})();
