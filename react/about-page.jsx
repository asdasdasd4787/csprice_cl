(() => {
  const { Layout, mountPage, InfoSkinShowcase, useI18n } = window.CS2React;

  const CONTACT_EMAIL = "enquiries@csprice.eu";

  /**
   * Renders a translated sentence that contains {token} placeholders, swapping
   * each token for a React node. Splitting the sentence in JSX instead would
   * hard-code English word order — languages put the links in different places.
   */
  function renderWithTokens(text, nodes) {
    const parts = String(text || "").split(/(\{[a-zA-Z]+\})/g);
    return parts.map((part, index) => {
      const match = part.match(/^\{([a-zA-Z]+)\}$/);
      if (match && nodes[match[1]]) {
        return <React.Fragment key={index}>{nodes[match[1]]}</React.Fragment>;
      }
      return <React.Fragment key={index}>{part}</React.Fragment>;
    });
  }

  function AboutPage() {
    const { t } = useI18n();

    return (
      <Layout>
        <div className="info-shell">
          <div className="info-main">
            <header className="info-head">
              <div className="info-kicker">CSPRICE</div>
              <h1>{t("about_title")}</h1>
              <p>{t("about_intro")}</p>
            </header>

            <div className="info-body">
              <section className="info-section">
                <h2>{t("about_sourceTitle")}</h2>
                <p>{t("about_sourceBody")}</p>
              </section>

              <section className="info-section">
                <h2>{t("about_enquiriesTitle")}</h2>
                <p>
                  {renderWithTokens(t("about_enquiriesBody"), {
                    contact: <a href="contact.html">{t("about_contactLink")}</a>,
                    email: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>,
                  })}
                </p>
              </section>

              <section className="info-section">
                <h2>{t("about_creditTitle")}</h2>
                <p>{t("about_creditIntro")}</p>
                <ul>
                  <li>{t("about_creditValve")}</li>
                  <li>{t("about_creditMarkets")}</li>
                </ul>
              </section>
            </div>
          </div>

          <InfoSkinShowcase />
        </div>
      </Layout>
    );
  }

  mountPage(<AboutPage />);
})();
