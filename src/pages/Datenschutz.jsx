import React from 'react';
import { Link } from 'react-router-dom';

const Datenschutz = () => {
    return (
        <div className="min-h-screen bg-gray-50 p-6 md:p-12">
            <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm p-8 md:p-12">
                <div className="mb-8">
                    <Link to="/" className="text-blue-600 hover:text-blue-800 font-medium">← Zurück zur App</Link>
                </div>

                <h1 className="text-3xl font-bold text-gray-900 mb-8">Datenschutzerklärung</h1>

                <div className="space-y-6 text-gray-700">
                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-2">1. Datenschutz auf einen Blick</h2>
                        <h3 className="text-lg font-medium text-gray-900 mt-4 mb-2">Allgemeine Hinweise</h3>
                        <p>
                            Die folgenden Hinweise geben einen einfachen Überblick darüber, was mit Ihren personenbezogenen Daten passiert, wenn Sie diese Website besuchen.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-2">2. Hosting</h2>
                        <p>
                            Wir hosten die Inhalte unserer Website bei folgendem Anbieter:
                        </p>
                        <h3 className="text-lg font-medium text-gray-900 mt-4 mb-2">Supabase / Cloudflare</h3>
                        <p>
                            Der Anbieter ist Supabase Inc. (USA) für Datenbankdienste und Cloudflare Inc. (USA) für das Hosting des Frontends.
                            Die Datenverarbeitung erfolgt auf Basis unserer berechtigten Interessen an einer sicheren und effizienten Bereitstellung unseres Online-Angebots nach Art. 6 Abs. 1 lit. f DSGVO.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-2">3. Allgemeine Hinweise und Pflichtinformationen</h2>
                        <h3 className="text-lg font-medium text-gray-900 mt-4 mb-2">Datenschutz</h3>
                        <p>
                            Die Betreiber dieser Seiten nehmen den Schutz Ihrer persönlichen Daten sehr ernst. Wir behandeln Ihre personenbezogenen Daten vertraulich und entsprechend der gesetzlichen Datenschutzvorschriften sowie dieser Datenschutzerklärung.
                        </p>
                        <h3 className="text-lg font-medium text-gray-900 mt-4 mb-2">Hinweis zur verantwortlichen Stelle</h3>
                        <p className="mb-1">Die verantwortliche Stelle für die Datenverarbeitung auf dieser Website ist:</p>
                        <p className="mb-1">[Name des Unternehmens]</p>
                        <p className="mb-1">[Adresse]</p>
                        <p>E-Mail: [E-Mail]</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-2">4. Datenerfassung auf dieser Website</h2>
                        <h3 className="text-lg font-medium text-gray-900 mt-4 mb-2">Cookies / Local Storage</h3>
                        <p>
                            Unsere Internetseiten verwenden so genannte &quot;Cookies&quot; bzw. Local Storage Technologien.
                            Diese dienen dazu, unser Angebot nutzerfreundlicher, effektiver und sicherer zu machen.
                            Insbesondere speichern wir Ihr Login-Token (Session), damit Sie eingeloggt bleiben.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default Datenschutz;
