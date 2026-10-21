import { Directive, ElementRef, Input, OnChanges, inject } from '@angular/core';

@Directive({
  selector: '[appSafeHtml]',
  standalone: true
})
export class SafeHtmlDirective implements OnChanges {
  @Input() appSafeHtml: string = '';
  
  private el = inject(ElementRef);

  ngOnChanges(): void {
    this.el.nativeElement.innerHTML = this.appSafeHtml || '';
  }
}