(() => {
  const { Layout, mountPage, InfoSkinShowcase, useI18n } = window.CS2React;

  const CONTACT_EMAIL = "enquiries@csprice.eu";

  function ContactPage() {
    const { t } = useI18n();

    return (
      <Layout>
        <div className="info-shell">
          <div className="info-main">
            <header className="info-head">
              <div className="info-kicker">CSPRICE</div>
              <h1>{t("contact_title")}</h1>
              <p>{t("contact_intro")}</p>
            </header>

            <div className="info-body">
              <section className="info-section">
                <h2>{t("contact_aboutTitle")}</h2>
                <ul>
                  <li>{t("contact_b1")}</li>
                  <li>{t("contact_b2")}</li>
                  <li>{t("contact_b3")}</li>
                  <li>{t("contact_b4")}</li>
                </ul>
              </section>

              <section className="info-section info-email-wrap">
                <h2>{t("contact_emailTitle")}</h2>
                <p>{t("contact_emailBody")}</p>
                <a className="info-email" href={`mailto:${CONTACT_EMAIL}`}>
                  <i className="fa-regular fa-envelope" aria-hidden="true" />
                  {CONTACT_EMAIL}
                </a>
              </section>
            </div>
          </div>

          <InfoSkinShowcase />
        </div>
      </Layout>
    );
  }

  mountPage(<ContactPage />);
})();
