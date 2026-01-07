import { Component, OnInit } from "@angular/core";
import { AngularFireAuth } from "@angular/fire/compat/auth";
import { AngularFireDatabase } from "@angular/fire/compat/database";
import { Observable, of } from "rxjs";
import { switchMap, map } from "rxjs/operators";
import { Itinerary, ItineraryService } from "../../services/itinerary.service";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {
    userName: string = 'Traveler';
    itineraries$: Observable<Itinerary[]> = of([]);

    constructor(
        private afAuth: AngularFireAuth,
        private db: AngularFireDatabase,
        private itineraryService: ItineraryService
    ) {}

    ngOnInit(): void {
        this.itineraries$ = this.afAuth.authState.pipe(
            switchMap(user => {
                if (user) {
                    // Set user name from Firebase Auth profile
                    this.userName = user.displayName || user.email?.split('@')[0] || 'Traveler';
                    
                    // Fetch itineraries matching current user's ID
                    return this.db.list<Itinerary>('itineraries', ref => 
                        ref.orderByChild('userId').equalTo(user.uid)
                    ).valueChanges().pipe(
                        map(list => list.reverse())
                    );
                }
                return of([]);
            })
        );
    }

    async onToggleFavorite(item: Itinerary) {
        try {
            await this.itineraryService.toggleFavorite(item.itineraryId, !!item.isFavorite);
        } catch (error) {
            console.error('Error toggling favorite:', error);
        }
    }

    // Add this property to your HomeComponent class
    selectedItinerary: Itinerary | null = null;

    // Add this method to handle clicks
    selectItinerary(item: Itinerary) {
        this.selectedItinerary = item;
    }

    // Update the delete method slightly to clear selection if deleted
    async deleteItem(itineraryId: string) {
        if (confirm('Are you sure you want to delete this itinerary?')) {
            try {
                await this.itineraryService.deleteItinerary(itineraryId);
                if (this.selectedItinerary?.itineraryId === itineraryId) {
                    this.selectedItinerary = null;
                }
            } catch (error) {
                console.error('Error deleting itinerary:', error);
            }
        }
    }

    exportAsPdf(item: Itinerary) {
        const doc = new jsPDF();
        
        // Set Title
        doc.setFontSize(22);
        doc.setTextColor(63, 81, 181); // Match your Indigo theme
        doc.text(`${item.cityId.toUpperCase()} TRIP`, 14, 20);

        // Add Metadata
        doc.setFontSize(12);
        doc.setTextColor(40);
        doc.text(`Duration: ${item.days} Days`, 14, 30);
        doc.text(`Estimated Total Budget: $${item.totalCost}`, 14, 38);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 46);

        // Prepare Table Data
        const tableRows: any[] = [];
        const sortedDays = this.getScheduleDays(item.schedule);

        sortedDays.forEach(dayKey => {
        // Joins activity IDs with a newline and bullet point
        const activities = item.schedule[dayKey].join('\n• ');
        tableRows.push([
            dayKey.toUpperCase(),
            `• ${activities}`
        ]);
        });

        // Create Table
        autoTable(doc, {
        startY: 55,
        head: [['Day', 'Planned Activities']],
        body: tableRows,
        theme: 'striped',
        headStyles: { fillColor: [63, 81, 181] },
        styles: { cellPadding: 5, fontSize: 10, valign: 'middle' },
        columnStyles: {
            0: { cellWidth: 30, fontStyle: 'bold' },
            1: { cellWidth: 'auto' }
        }
        });

        // Download file
        doc.save(`Itinerary_${item.cityId}_${item.itineraryId.substring(0, 5)}.pdf`);
    }

    async viewOnMap(item: Itinerary) {
        console.log('Opening Map view...', item.itineraryId);
        // Implementation later
    }

    // Add this helper method to your HomeComponent class
    getScheduleDays(schedule: Record<string, string[]> | undefined): string[] {
        if (!schedule) return [];
        // This returns ['day1', 'day2', ...] sorted correctly
        return Object.keys(schedule).sort((a, b) => {
            const numA = parseInt(a.replace(/\D/g, ''));
            const numB = parseInt(b.replace(/\D/g, ''));
            return numA - numB;
        });
    }
}