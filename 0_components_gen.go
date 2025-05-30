package main

import "github.com/vugu/vugu"

import "fmt"
import "reflect"
import "github.com/vugu/vjson"

import js "github.com/vugu/vugu/js"
import "log"

var _ vugu.DOMEvent	// import fixer

// Root is a Vugu component and implements the vugu.Builder interface.
type Root struct{}

func (c *Root) Build(vgin *vugu.BuildIn) (vgout *vugu.BuildOut) {

	vgout = &vugu.BuildOut{}

	var vgiterkey interface{}
	_ = vgiterkey
	var vgn *vugu.VGNode
	vgn = &vugu.VGNode{Type: vugu.VGNodeType(3), Data: "style", Attr: []vugu.VGAttribute(nil)}
	{
		vgn.AppendChild(&vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@100..900&display=swap');\n    @keyframes float {\n        0%, 100% { transform: translateY(0px) rotate(0deg); }\n        25% { transform: translateY(-8px) rotate(1deg); }\n        50% { transform: translateY(-12px) rotate(0deg); }\n        75% { transform: translateY(-8px) rotate(-1deg); }\n    }\n    @keyframes swell {\n        0%, 100% { transform: scaleY(1) translateY(0); }\n        50% { transform: scaleY(1.1) translateY(-5px); }\n    }\n    @keyframes drift {\n        0% { transform: translateX(0); }\n        100% { transform: translateX(-100%); }\n    }\n    @keyframes sparkle {\n        0%, 100% { opacity: 0; transform: scale(0); }\n        50% { opacity: 1; transform: scale(1); }\n    }\n    .float-animation {\n        animation: float 4s ease-in-out infinite;\n    }\n    .swell-animation {\n        animation: swell 5s ease-in-out infinite;\n    }\n    .drift-animation {\n        animation: drift 20s linear infinite;\n    }\n    .sparkle {\n        animation: sparkle 3s ease-in-out infinite;\n    }\n", Attr: []vugu.VGAttribute(nil)})
	}
	vgout.AppendCSS(vgn)
	vgn = &vugu.VGNode{Type: vugu.VGNodeType(3), Namespace: "", Data: "div", Attr: []vugu.VGAttribute{{Namespace: "", Key: "class", Val: "min-h-screen bg-gradient-to-b from-sky-300 via-sky-400 to-blue-500 overflow-hidden relative flex items-center"}}}
	vgout.Out = append(vgout.Out, vgn)	// root for output
	{
		vgparent := vgn
		_ = vgparent
		vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n    "}
		vgparent.AppendChild(vgn)
		vgn = &vugu.VGNode{Type: vugu.VGNodeType(3), Namespace: "", Data: "div", Attr: []vugu.VGAttribute{{Namespace: "", Key: "class", Val: "absolute top-8 right-12 w-24 h-24 bg-yellow-300 rounded-full shadow-2xl"}}}
		vgparent.AppendChild(vgn)
		vgn.SetInnerHTML(vugu.HTML("\n        \x3Cdiv class=\"absolute inset-2 bg-yellow-200 rounded-full\"\x3E\x3C/div\x3E\n        \x3Cdiv class=\"absolute -inset-4 bg-yellow-300/20 rounded-full blur-xl\"\x3E\x3C/div\x3E\n    "))
		vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n\n    "}
		vgparent.AppendChild(vgn)
		vgn = &vugu.VGNode{Type: vugu.VGNodeType(3), Namespace: "", Data: "div", Attr: []vugu.VGAttribute{{Namespace: "", Key: "class", Val: "absolute top-16 left-20 w-32 h-16 bg-white rounded-full opacity-80"}}}
		vgparent.AppendChild(vgn)
		vgn.SetInnerHTML(vugu.HTML(""))
		vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n    "}
		vgparent.AppendChild(vgn)
		vgn = &vugu.VGNode{Type: vugu.VGNodeType(3), Namespace: "", Data: "div", Attr: []vugu.VGAttribute{{Namespace: "", Key: "class", Val: "absolute top-24 left-40 w-24 h-12 bg-white rounded-full opacity-70"}}}
		vgparent.AppendChild(vgn)
		vgn.SetInnerHTML(vugu.HTML(""))
		vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n    "}
		vgparent.AppendChild(vgn)
		vgn = &vugu.VGNode{Type: vugu.VGNodeType(3), Namespace: "", Data: "div", Attr: []vugu.VGAttribute{{Namespace: "", Key: "class", Val: "absolute top-12 right-40 w-28 h-14 bg-white rounded-full opacity-75"}}}
		vgparent.AppendChild(vgn)
		vgn.SetInnerHTML(vugu.HTML(""))
		vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n\n    "}
		vgparent.AppendChild(vgn)
		vgn = &vugu.VGNode{Type: vugu.VGNodeType(3), Namespace: "", Data: "h1", Attr: []vugu.VGAttribute{{Namespace: "", Key: "class", Val: "mx-auto text-6xl md:text-9xl font-bold font-[Outfit] text-white mb-40 drop-shadow-lg z-50"}}}
		vgparent.AppendChild(vgn)
		vgn.SetInnerHTML(vugu.HTML("\n        FileFerry\n    "))
		vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n\n    "}
		vgparent.AppendChild(vgn)
		vgn = &vugu.VGNode{Type: vugu.VGNodeType(3), Namespace: "", Data: "div", Attr: []vugu.VGAttribute{{Namespace: "", Key: "class", Val: "absolute bottom-52 z-49 left-1/2 transform -translate-x-1/2"}}}
		vgparent.AppendChild(vgn)
		{
			vgparent := vgn
			_ = vgparent
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n        "}
			vgparent.AppendChild(vgn)
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(4), Data: " Ferry boat "}
			vgparent.AppendChild(vgn)
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n        "}
			vgparent.AppendChild(vgn)
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(3), Namespace: "", Data: "div", Attr: []vugu.VGAttribute{{Namespace: "", Key: "class", Val: "float-animation mt-20"}}}
			vgparent.AppendChild(vgn)
			{
				vgparent := vgn
				_ = vgparent
				vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n            "}
				vgparent.AppendChild(vgn)
				vgn = &vugu.VGNode{Type: vugu.VGNodeType(3), Namespace: "", Data: "div", Attr: []vugu.VGAttribute{{Namespace: "", Key: "class", Val: "relative"}}}
				vgparent.AppendChild(vgn)
				{
					vgparent := vgn
					_ = vgparent
					vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n                "}
					vgparent.AppendChild(vgn)
					vgn = &vugu.VGNode{Type: vugu.VGNodeType(4), Data: " Red boat hull "}
					vgparent.AppendChild(vgn)
					vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n                "}
					vgparent.AppendChild(vgn)
					vgn = &vugu.VGNode{Type: vugu.VGNodeType(3), Namespace: "", Data: "div", Attr: []vugu.VGAttribute{{Namespace: "", Key: "class", Val: "w-96 h-48 bg-red-500 rounded-b-[30%] relative shadow-2xl"}}}
					vgparent.AppendChild(vgn)
					{
						vgparent := vgn
						_ = vgparent
						vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n                    "}
						vgparent.AppendChild(vgn)
						vgn = &vugu.VGNode{Type: vugu.VGNodeType(3), Namespace: "", Data: "div", Attr: []vugu.VGAttribute{{Namespace: "", Key: "class", Val: "absolute inset-0 bg-gradient-to-b from-red-500 to-red-700 rounded-b-[30%]"}}}
						vgparent.AppendChild(vgn)
						vgn.SetInnerHTML(vugu.HTML(""))
						vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n\n                    "}
						vgparent.AppendChild(vgn)
						vgn = &vugu.VGNode{Type: vugu.VGNodeType(4), Data: " White deck stripes "}
						vgparent.AppendChild(vgn)
						vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n                    "}
						vgparent.AppendChild(vgn)
						vgn = &vugu.VGNode{Type: vugu.VGNodeType(3), Namespace: "", Data: "div", Attr: []vugu.VGAttribute{{Namespace: "", Key: "class", Val: "absolute top-3 left-0 right-0 h-3 bg-white"}}}
						vgparent.AppendChild(vgn)
						vgn.SetInnerHTML(vugu.HTML(""))
						vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n                    "}
						vgparent.AppendChild(vgn)
						vgn = &vugu.VGNode{Type: vugu.VGNodeType(3), Namespace: "", Data: "div", Attr: []vugu.VGAttribute{{Namespace: "", Key: "class", Val: "absolute top-8 left-0 right-0 h-2 bg-white/80"}}}
						vgparent.AppendChild(vgn)
						vgn.SetInnerHTML(vugu.HTML(""))
						vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n\n                    "}
						vgparent.AppendChild(vgn)
						vgn = &vugu.VGNode{Type: vugu.VGNodeType(4), Data: " White cabin structure "}
						vgparent.AppendChild(vgn)
						vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n                    "}
						vgparent.AppendChild(vgn)
						vgn = &vugu.VGNode{Type: vugu.VGNodeType(3), Namespace: "", Data: "div", Attr: []vugu.VGAttribute{{Namespace: "", Key: "class", Val: "absolute -top-24 left-1/2 transform -translate-x-1/2 w-80 h-40 bg-white rounded-t-2xl rounded-b-lg shadow-xl"}}}
						vgparent.AppendChild(vgn)
						{
							vgparent := vgn
							_ = vgparent
							vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n                        "}
							vgparent.AppendChild(vgn)
							vgn = &vugu.VGNode{Type: vugu.VGNodeType(3), Namespace: "", Data: "div", Attr: []vugu.VGAttribute{{Namespace: "", Key: "class", Val: "absolute -top-4 left-1/2 transform -translate-x-1/2 w-72 h-4 bg-gray-100 rounded-t-xl"}}}
							vgparent.AppendChild(vgn)
							vgn.SetInnerHTML(vugu.HTML(""))
							vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n\n                        "}
							vgparent.AppendChild(vgn)
							vgn = &vugu.VGNode{Type: vugu.VGNodeType(4), Data: " Windows row "}
							vgparent.AppendChild(vgn)
							vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n                        "}
							vgparent.AppendChild(vgn)
							vgn = &vugu.VGNode{Type: vugu.VGNodeType(3), Namespace: "", Data: "div", Attr: []vugu.VGAttribute{{Namespace: "", Key: "class", Val: "flex justify-center gap-3 pt-3 mb-3"}}}
							vgparent.AppendChild(vgn)
							vgn.SetInnerHTML(vugu.HTML("\n                            \x3Cdiv class=\"w-10 h-6 bg-sky-400 rounded-sm\"\x3E\x3C/div\x3E\n                            \x3Cdiv class=\"w-10 h-6 bg-sky-400 rounded-sm\"\x3E\x3C/div\x3E\n                            \x3Cdiv class=\"w-10 h-6 bg-sky-400 rounded-sm\"\x3E\x3C/div\x3E\n                            \x3Cdiv class=\"w-10 h-6 bg-sky-400 rounded-sm\"\x3E\x3C/div\x3E\n                        "))
							vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n\n                        "}
							vgparent.AppendChild(vgn)
							vgn = &vugu.VGNode{Type: vugu.VGNodeType(4), Data: " Buttons "}
							vgparent.AppendChild(vgn)
							vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n                        "}
							vgparent.AppendChild(vgn)
							vgn = &vugu.VGNode{Type: vugu.VGNodeType(3), Namespace: "", Data: "div", Attr: []vugu.VGAttribute{{Namespace: "", Key: "class", Val: "px-8 space-y-3"}}}
							vgparent.AppendChild(vgn)
							vgn.SetInnerHTML(vugu.HTML("\n                            \x3Cbutton class=\"w-full bg-blue-600 text-white py-3.5 px-6 rounded-xl font-semibold hover:bg-blue-700 transition-colors shadow-md text-lg flex items-center justify-center gap-2\"\x3E\n                                \x3Cspan class=\"text-xl\"\x3E⚓\x3C/span\x3E Send\n                            \x3C/button\x3E\n                            \x3Cbutton class=\"w-full bg-orange-500 text-white py-3.5 px-6 rounded-xl font-semibold hover:bg-orange-600 transition-colors shadow-md text-lg flex items-center justify-center gap-2\"\x3E\n                                \x3Cspan class=\"text-xl\"\x3E📦\x3C/span\x3E Receive\n                            \x3C/button\x3E\n                        "))
							vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n                    "}
							vgparent.AppendChild(vgn)
						}
						vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n\n                    "}
						vgparent.AppendChild(vgn)
						vgn = &vugu.VGNode{Type: vugu.VGNodeType(3), Namespace: "", Data: "div", Attr: []vugu.VGAttribute{{Namespace: "", Key: "class", Val: "absolute bottom-8 left-1/2 transform -translate-x-1/2 w-20 h-20 bg-white/20 rounded-full"}}}
						vgparent.AppendChild(vgn)
						vgn.SetInnerHTML(vugu.HTML(""))
						vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n                "}
						vgparent.AppendChild(vgn)
					}
					vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n            "}
					vgparent.AppendChild(vgn)
				}
				vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n        "}
				vgparent.AppendChild(vgn)
			}
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n    "}
			vgparent.AppendChild(vgn)
		}
		vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n\n    "}
		vgparent.AppendChild(vgn)
		vgn = &vugu.VGNode{Type: vugu.VGNodeType(4), Data: " Ocean Design 3: Smooth gradient waves "}
		vgparent.AppendChild(vgn)
		vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n    "}
		vgparent.AppendChild(vgn)
		vgn = &vugu.VGNode{Type: vugu.VGNodeType(3), Namespace: "", Data: "div", Attr: []vugu.VGAttribute{{Namespace: "", Key: "class", Val: "absolute bottom-0 left-0 right-0"}}}
		vgparent.AppendChild(vgn)
		{
			vgparent := vgn
			_ = vgparent
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n        "}
			vgparent.AppendChild(vgn)
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(4), Data: " Gradient wave bands "}
			vgparent.AppendChild(vgn)
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n        "}
			vgparent.AppendChild(vgn)
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(3), Namespace: "", Data: "div", Attr: []vugu.VGAttribute{{Namespace: "", Key: "class", Val: "absolute bottom-56 w-full h-12 bg-gradient-to-b from-transparent to-blue-400/20 swell-animation"}}}
			vgparent.AppendChild(vgn)
			vgn.SetInnerHTML(vugu.HTML(""))
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n        "}
			vgparent.AppendChild(vgn)
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(3), Namespace: "", Data: "div", Attr: []vugu.VGAttribute{{Namespace: "", Key: "class", Val: "absolute bottom-52 w-full h-8 bg-gradient-to-b from-transparent to-blue-500/30 swell-animation"}, vugu.VGAttribute{Namespace: "", Key: "style", Val: "animation-delay: 0.5s"}}}
			vgparent.AppendChild(vgn)
			vgn.SetInnerHTML(vugu.HTML(""))
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n\n        "}
			vgparent.AppendChild(vgn)
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(4), Data: " Main smooth wave "}
			vgparent.AppendChild(vgn)
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n        "}
			vgparent.AppendChild(vgn)
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(3), Namespace: "", Data: "div", Attr: []vugu.VGAttribute{{Namespace: "", Key: "class", Val: "absolute bottom-48 w-full overflow-hidden"}}}
			vgparent.AppendChild(vgn)
			vgn.SetInnerHTML(vugu.HTML("\n            \x3Cdiv class=\"relative w-[200%] h-24 drift-animation\"\x3E\n                \x3Csvg class=\"absolute w-full h-full\" viewBox=\"0 0 2880 96\" preserveAspectRatio=\"none\"\x3E\n                    \x3Cdefs\x3E\n                        \x3ClinearGradient id=\"waveGradient\" x1=\"0%\" y1=\"0%\" x2=\"0%\" y2=\"100%\"\x3E\n                            \x3Cstop offset=\"0%\" style=\"stop-color:#3b82f6;stop-opacity:0.4\"\x3E\x3C/stop\x3E\n                            \x3Cstop offset=\"100%\" style=\"stop-color:#1e40af;stop-opacity:0.8\"\x3E\x3C/stop\x3E\n                        \x3C/linearGradient\x3E\n                    \x3C/defs\x3E\n                    \x3Cpath d=\"M0,48 C240,96 480,0 720,48 C960,96 1200,0 1440,48 C1680,96 1920,0 2160,48 C2400,96 2640,0 2880,48 L2880,96 L0,96 Z\" fill=\"url(#waveGradient)\"\x3E\x3C/path\x3E\n                \x3C/svg\x3E\n            \x3C/div\x3E\n        "))
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n\n        "}
			vgparent.AppendChild(vgn)
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(4), Data: " Mid-level waves "}
			vgparent.AppendChild(vgn)
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n        "}
			vgparent.AppendChild(vgn)
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(3), Namespace: "", Data: "div", Attr: []vugu.VGAttribute{{Namespace: "", Key: "class", Val: "absolute bottom-32 w-full h-32"}}}
			vgparent.AppendChild(vgn)
			vgn.SetInnerHTML(vugu.HTML("\n            \x3Csvg class=\"w-full h-full swell-animation\" viewBox=\"0 0 1440 128\" preserveAspectRatio=\"none\" style=\"animation-delay: 1s\"\x3E\n                \x3Cdefs\x3E\n                    \x3CradialGradient id=\"oceanGradient\"\x3E\n                        \x3Cstop offset=\"0%\" style=\"stop-color:#2563eb;stop-opacity:0.6\"\x3E\x3C/stop\x3E\n                        \x3Cstop offset=\"100%\" style=\"stop-color:#1e40af;stop-opacity:0.9\"\x3E\x3C/stop\x3E\n                    \x3C/radialGradient\x3E\n                \x3C/defs\x3E\n                \x3Cpath d=\"M0,32 C360,80 720,0 1080,32 C1260,48 1380,64 1440,64 L1440,128 L0,128 Z\" fill=\"url(#oceanGradient)\"\x3E\x3C/path\x3E\n            \x3C/svg\x3E\n        "))
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n\n        "}
			vgparent.AppendChild(vgn)
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(4), Data: " Ocean base with shimmer effect "}
			vgparent.AppendChild(vgn)
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n        "}
			vgparent.AppendChild(vgn)
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(3), Namespace: "", Data: "div", Attr: []vugu.VGAttribute{{Namespace: "", Key: "class", Val: "h-48 bg-gradient-to-b from-blue-600 via-blue-700 to-blue-900 relative"}}}
			vgparent.AppendChild(vgn)
			vgn.SetInnerHTML(vugu.HTML("\n            \x3Cdiv class=\"absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent drift-animation\"\x3E\x3C/div\x3E\n        "))
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n\n        "}
			vgparent.AppendChild(vgn)
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(4), Data: " Light reflections "}
			vgparent.AppendChild(vgn)
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n        "}
			vgparent.AppendChild(vgn)
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(3), Namespace: "", Data: "div", Attr: []vugu.VGAttribute{{Namespace: "", Key: "class", Val: "absolute bottom-60 left-1/3 w-1 h-1 bg-white rounded-full sparkle"}}}
			vgparent.AppendChild(vgn)
			vgn.SetInnerHTML(vugu.HTML(""))
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n        "}
			vgparent.AppendChild(vgn)
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(3), Namespace: "", Data: "div", Attr: []vugu.VGAttribute{{Namespace: "", Key: "class", Val: "absolute bottom-58 right-1/4 w-1 h-1 bg-white rounded-full sparkle"}, vugu.VGAttribute{Namespace: "", Key: "style", Val: "animation-delay: 1s"}}}
			vgparent.AppendChild(vgn)
			vgn.SetInnerHTML(vugu.HTML(""))
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n        "}
			vgparent.AppendChild(vgn)
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(3), Namespace: "", Data: "div", Attr: []vugu.VGAttribute{{Namespace: "", Key: "class", Val: "absolute bottom-62 left-2/3 w-1 h-1 bg-white rounded-full sparkle"}, vugu.VGAttribute{Namespace: "", Key: "style", Val: "animation-delay: 2s"}}}
			vgparent.AppendChild(vgn)
			vgn.SetInnerHTML(vugu.HTML(""))
			vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n    "}
			vgparent.AppendChild(vgn)
		}
		vgn = &vugu.VGNode{Type: vugu.VGNodeType(1), Data: "\n"}
		vgparent.AppendChild(vgn)
	}
	return vgout
}

// 'fix' unused imports
var _ fmt.Stringer
var _ reflect.Type
var _ vjson.RawMessage
var _ js.Value
var _ log.Logger
