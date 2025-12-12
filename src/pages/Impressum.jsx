import React from 'react';
import { Link } from 'react-router-dom';

const Impressum = () => {
    return (
        <div className="min-h-screen bg-gray-50 p-6 md:p-12">
            <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm p-8 md:p-12">
                <div className="mb-8">
                    <Link to="/" className="text-blue-600 hover:text-blue-800 font-medium">← Zurück zur App</Link>
                </div>

                <h1 className="text-3xl font-bold text-gray-900 mb-8">Impressum</h1>

                <div className="space-y-6 text-gray-700">
                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-2">Angaben gemäß § 5 TMG</h2>
                        <p className="mb-1">[Name des Unternehmens / Trägers]</p>
                        <p className="mb-1">[Straße Hausnummer]</p>
                        <p>[PLZ Ort]</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-2">Vertreten durch</h2>
                        <p>[Vorname Nachname der Geschäftsführung]</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-2">Kontakt</h2>
                        <p className="mb-1">Telefon: [Telefonnummer]</p>
                        <p className="mb-1">E-Mail: [E-Mail-Adresse]</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-2">Registereintrag</h2>
                        <p className="mb-1">Eintragung im Handelsregister.</p>
                        <p className="mb-1">Registergericht: [Amtsgericht Ort]</p>
                        <p>Registernummer: [HRB Nummer]</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-2">Umsatzsteuer-ID</h2>
                        <p className="mb-1">Umsatzsteuer-Identifikationsnummer gemäß §27 a Umsatzsteuergesetz:</p>
                        <p>[DE 123 456 789]</p>
                    </section>

                    <div className="mt-12 pt-8 border-t text-sm text-gray-500">
                        <p>Das Impressum gilt auch für unsere Social-Media-Profile.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Impressum;
